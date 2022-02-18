import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

import { Globals } from '../src/globals';
import { Mode } from '../src/mode/mode';
import { assertEqualLines, reloadConfiguration } from './testUtils';
import { globalState } from '../src/state/globalState';
import { IKeyRemapping } from '../src/configuration/iconfiguration';
import * as os from 'os';
import { VimrcImpl } from '../src/configuration/vimrc';
import { vimrcKeyRemappingBuilder } from '../src/configuration/vimrcKeyRemappingBuilder';
import { IConfiguration } from '../src/configuration/iconfiguration';
import { Position } from 'vscode';
import { ModeHandlerMap } from '../src/mode/modeHandlerMap';
import { StatusBar } from '../src/statusBar';
import { Register } from '../src/register/register';
import { ModeHandler } from '../src/mode/modeHandler';

function getNiceStack(stack: string | undefined): string {
  return stack ? stack.split('\n').splice(2, 1).join('\n') : 'no stack available :(';
}

function newTestGeneric<T extends ITestObject | ITestWithRemapsObject>(
  testObj: T,
  testFunc: Mocha.TestFunction | Mocha.ExclusiveTestFunction | Mocha.PendingTestFunction,
  innerTest: (testObj: T) => Promise<ModeHandler>
): void {
  const stack = getNiceStack(new Error().stack);

  testFunc(testObj.title, async () => {
    const prevConfig = { ...Globals.mockConfiguration };
    try {
      if (testObj.config) {
        for (const key in testObj.config) {
          if (testObj.config.hasOwnProperty(key)) {
            const value = testObj.config[key];
            Globals.mockConfiguration[key] = value;
          }
        }
        await reloadConfiguration();
      }
      await innerTest(testObj);
    } catch (reason) {
      reason.stack = stack;
      throw reason;
    } finally {
      if (testObj.config) {
        Globals.mockConfiguration = prevConfig;
        await reloadConfiguration();
      }
    }
  });
}

export const newTest = (testObj: ITestObject) => newTestGeneric(testObj, test, testIt);

export const newTestOnly = (testObj: ITestObject) => {
  console.warn('!!! Running single test !!!');
  return newTestGeneric(testObj, test.only, testIt);
};

export const newTestSkip = (testObj: ITestObject, skipCondition: boolean = true) =>
  newTestGeneric(testObj, skipCondition ? test.skip : test, testIt);

export const newTestWithRemaps = (testObj: ITestWithRemapsObject) =>
  newTestGeneric(testObj, test, testItWithRemaps);
export const newTestWithRemapsOnly = (testObj: ITestWithRemapsObject) => {
  console.warn('!!! Running single test !!!');
  return newTestGeneric(testObj, test.only, testItWithRemaps);
};
export const newTestWithRemapsSkip = (testObj: ITestWithRemapsObject) =>
  newTestGeneric(testObj, test.skip, testItWithRemaps);

interface ITestObject {
  title: string;
  config?: Partial<IConfiguration>;
  editorOptions?: vscode.TextEditorOptions;
  start: string[];
  keysPressed: string;
  end: string[];
  endMode?: Mode;
  statusBar?: string;
  jumps?: string[];
  stub?: {
    stubClass: any;
    methodName: string;
    returnValue: any;
  };
}

type Step = {
  title?: string;
  keysPressed: string;
  stepResult: {
    end: string[];
    endAfterTimeout?: string[];
    endMode?: Mode;
    endModeAfterTimeout?: Mode;
    jumps?: string[];
  };
};

interface ITestWithRemapsObject {
  title: string;
  config?: Partial<IConfiguration>;
  start: string[];
  remaps?:
    | {
        normalModeKeyBindings?: IKeyRemapping[];
        normalModeKeyBindingsNonRecursive?: IKeyRemapping[];
        insertModeKeyBindings?: IKeyRemapping[];
        insertModeKeyBindingsNonRecursive?: IKeyRemapping[];
        visualModeKeyBindings?: IKeyRemapping[];
        visualModeKeyBindingsNonRecursive?: IKeyRemapping[];
        operatorPendingModeKeyBindings?: IKeyRemapping[];
        operatorPendingModeKeyBindingsNonRecursive?: IKeyRemapping[];
      }
    | string[];
  steps: Step[];
}

class TestObjectHelper {
  /**
   * Position that the test says that the cursor starts at.
   */
  startPosition = new Position(0, 0);

  /**
   * Position that the test says that the cursor ends at.
   */
  endPosition = new Position(0, 0);

  public readonly isValid: boolean;
  private readonly testObject: ITestObject;

  constructor(testObject: ITestObject) {
    this.testObject = testObject;

    this.isValid =
      this.setStartCursorPosition(testObject.start) && this.setEndCursorPosition(testObject.end);
  }

  private setStartCursorPosition(lines: string[]): boolean {
    const result = this.getCursorPosition(lines);
    this.startPosition = result.position;
    return result.success;
  }

  private setEndCursorPosition(lines: string[]): boolean {
    const result = this.getCursorPosition(lines);
    this.endPosition = result.position;
    return result.success;
  }

  private getCursorPosition(lines: string[]): { success: boolean; position: Position } {
    const ret = { success: false, position: new Position(0, 0) };
    for (let i = 0; i < lines.length; i++) {
      const columnIdx = lines[i].indexOf('|');
      if (columnIdx >= 0) {
        ret.position = new Position(i, columnIdx);
        ret.success = true;
      }
    }

    return ret;
  }

  public asVimOutputText(): string[] {
    const ret = this.testObject.end.slice(0);
    ret[this.endPosition.line] = ret[this.endPosition.line].replace('|', '');
    return ret;
  }
}

class TestWithRemapsObjectHelper {
  /**
   * Position that the test says that the cursor starts at.
   */
  currentStepStartPosition = new Position(0, 0);

  /**
   * Position that the test says that the cursor ends at.
   */
  currentStepEndPosition = new Position(0, 0);

  /**
   * Position that the test says that the cursor ends at after timeout finishes.
   */
  currentStepEndAfterTimeoutPosition: Position | undefined;

  /**
   * Current step index
   */
  currentStep = 0;

  private _isValid = false;
  private testObject: ITestWithRemapsObject;

  constructor(testObject: ITestWithRemapsObject) {
    this.testObject = testObject;

    this.parseStep(testObject);
  }

  public get isValid(): boolean {
    return this._isValid;
  }

  private setStartCursorPosition(lines: string[]): boolean {
    const result = this.getCursorPosition(lines);
    this.currentStepStartPosition = result.position;
    return result.success;
  }

  private setEndCursorPosition(lines: string[]): boolean {
    const result = this.getCursorPosition(lines);
    this.currentStepEndPosition = result.position;
    return result.success;
  }

  private setEndAfterTimeoutCursorPosition(lines: string[] | undefined): boolean {
    if (!lines) {
      return true;
    }
    const result = this.getCursorPosition(lines);
    this.currentStepEndAfterTimeoutPosition = result.position;
    return result.success;
  }

  private getCursorPosition(lines: string[]): { success: boolean; position: Position } {
    const ret = { success: false, position: new Position(0, 0) };
    for (let i = 0; i < lines.length; i++) {
      const columnIdx = lines[i].indexOf('|');
      if (columnIdx >= 0) {
        ret.position = new Position(i, columnIdx);
        ret.success = true;
      }
    }

    return ret;
  }

  public parseStep(t: ITestWithRemapsObject): void {
    this._isValid = true;
    const stepIdx = this.currentStep;
    if (stepIdx === 0) {
      if (!this.setStartCursorPosition(t.start)) {
        this._isValid = false;
        return;
      }
    } else {
      const lastStepEnd =
        t.steps[stepIdx - 1].stepResult.endAfterTimeout ?? t.steps[stepIdx - 1].stepResult.end;
      if (!this.setStartCursorPosition(lastStepEnd)) {
        this._isValid = false;
        return;
      }
    }
    if (!this.setEndCursorPosition(t.steps[stepIdx].stepResult.end)) {
      this._isValid = false;
      return;
    }
    if (!this.setEndAfterTimeoutCursorPosition(t.steps[stepIdx].stepResult.endAfterTimeout)) {
      this._isValid = false;
      return;
    }
  }

  public asVimOutputText(afterTimeout: boolean = false): string[] {
    const step = this.testObject.steps[this.currentStep];
    const ret = afterTimeout
      ? step.stepResult.endAfterTimeout!.slice(0)
      : step.stepResult.end.slice(0);
    const cursorLine = afterTimeout
      ? this.currentStepEndAfterTimeoutPosition!.line
      : this.currentStepEndPosition.line;
    ret[cursorLine] = ret[cursorLine].replace('|', '');
    return ret;
  }
}

/**
 * Tokenize a string like "abc<Esc>d<C-c>" into ["a", "b", "c", "<Esc>", "d", "<C-c>"]
 */
function tokenizeKeySequence(sequence: string): string[] {
  let isBracketedKey = false;
  let key = '';
  const result: string[] = [];

  // no close bracket, probably trying to do a left shift, take literal
  // char sequence
  function rawTokenize(characters: string): void {
    for (const char of characters) {
      result.push(char);
    }
  }

  for (const char of sequence) {
    key += char;

    if (char === '<') {
      if (isBracketedKey) {
        rawTokenize(key.slice(0, key.length - 1));
        key = '<';
      } else {
        isBracketedKey = true;
      }
    }

    if (char === '>') {
      isBracketedKey = false;
    }

    if (isBracketedKey) {
      continue;
    }

    result.push(key);
    key = '';
  }

  if (isBracketedKey) {
    rawTokenize(key);
  }

  return result;
}

async function testIt(testObj: ITestObject): Promise<ModeHandler> {
  const editor = vscode.window.activeTextEditor;
  assert(editor, 'Expected an active editor');

  const helper = new TestObjectHelper(testObj);
  assert(helper.isValid, "Missing '|' in test object.");

  if (testObj.editorOptions) {
    editor.options = testObj.editorOptions;
  }

  // Initialize the editor with the starting text and cursor selection
  await editor.edit((builder) => {
    builder.insert(new Position(0, 0), testObj.start.join('\n').replace('|', ''));
  });
  await editor.document.save();
  editor.selections = [new vscode.Selection(helper.startPosition, helper.startPosition)];

  // Generate a brand new ModeHandler for this editor
  ModeHandlerMap.clear();
  const [modeHandler, _] = await ModeHandlerMap.getOrCreate(editor.document.uri);

  let keysPressed = testObj.keysPressed;
  if (process.platform === 'win32') {
    keysPressed = keysPressed.replace(/\\n/g, '\\r\\n');
  }

  const jumpTracker = globalState.jumpTracker;
  jumpTracker.clearJumps();

  Register.clearAllRegisters();

  if (testObj.stub) {
    const confirmStub = sinon
      .stub(testObj.stub.stubClass.prototype, testObj.stub.methodName)
      .resolves(testObj.stub.returnValue);
    await modeHandler.handleMultipleKeyEvents(tokenizeKeySequence(keysPressed));
    confirmStub.restore();
  } else {
    // Assumes key presses are single characters for now
    await modeHandler.handleMultipleKeyEvents(tokenizeKeySequence(keysPressed));
  }

  // Check given end output is correct
  const lines = helper.asVimOutputText();
  assertEqualLines(lines);

  // Check final cursor position
  const actualPosition = modeHandler.vimState.editor.selection.start;
  const expectedPosition = helper.endPosition;
  assert.deepStrictEqual(
    { line: actualPosition.line, character: actualPosition.character },
    { line: expectedPosition.line, character: expectedPosition.character },
    'Cursor position is wrong.'
  );

  // endMode: check end mode is correct if given
  if (testObj.endMode !== undefined) {
    const actualMode = Mode[modeHandler.currentMode].toUpperCase();
    const expectedMode = Mode[testObj.endMode].toUpperCase();
    assert.strictEqual(actualMode, expectedMode, "Didn't enter correct mode.");
  }

  if (testObj.statusBar !== undefined) {
    assert.strictEqual(
      StatusBar.getText(),
      testObj.statusBar.replace('{FILENAME}', modeHandler.vimState.document.fileName),
      'Status bar text is wrong.'
    );
  }

  // jumps: check jumps are correct if given
  if (testObj.jumps !== undefined) {
    // TODO: Jumps should be specified by Positions, not line contents
    assert.deepStrictEqual(
      jumpTracker.jumps.map((j) => lines[j.position.line] || '<MISSING>'),
      testObj.jumps.map((t) => t.replace('|', '')),
      'Incorrect jumps found'
    );

    const stripBar = (text: string | undefined) => (text ? text.replace('|', '') : text);
    const actualJumpPosition =
      (jumpTracker.currentJump && lines[jumpTracker.currentJump.position.line]) || '<FRONT>';
    const expectedJumpPosition = stripBar(testObj.jumps.find((t) => t.includes('|'))) || '<FRONT>';

    assert.deepStrictEqual(
      actualJumpPosition.toString(),
      expectedJumpPosition.toString(),
      'Incorrect jump position found'
    );
  }

  return modeHandler;
}

async function testItWithRemaps(testObj: ITestWithRemapsObject): Promise<ModeHandler> {
  const editor = vscode.window.activeTextEditor;
  assert(editor, 'Expected an active editor');

  const helper = new TestWithRemapsObjectHelper(testObj);
  assert(helper.isValid, "Missing '|' in test object.");

  // Initialize the editor with the starting text and cursor selection
  await editor.edit((builder) => {
    builder.insert(new Position(0, 0), testObj.start.join('\n').replace('|', ''));
  });
  editor.selections = [
    new vscode.Selection(helper.currentStepStartPosition, helper.currentStepStartPosition),
  ];

  // Generate a brand new ModeHandler for this editor
  ModeHandlerMap.clear();
  const [modeHandler, _] = await ModeHandlerMap.getOrCreate(editor.document.uri);

  // Change remappings
  if (testObj.remaps) {
    if (!(testObj.remaps instanceof Array)) {
      Globals.mockConfiguration.normalModeKeyBindings = testObj.remaps?.normalModeKeyBindings ?? [];
      Globals.mockConfiguration.normalModeKeyBindingsNonRecursive =
        testObj.remaps?.normalModeKeyBindingsNonRecursive ?? [];
      Globals.mockConfiguration.insertModeKeyBindings = testObj.remaps?.insertModeKeyBindings ?? [];
      Globals.mockConfiguration.insertModeKeyBindingsNonRecursive =
        testObj.remaps?.insertModeKeyBindingsNonRecursive ?? [];
      Globals.mockConfiguration.visualModeKeyBindings = testObj.remaps?.visualModeKeyBindings ?? [];
      Globals.mockConfiguration.visualModeKeyBindingsNonRecursive =
        testObj.remaps?.visualModeKeyBindingsNonRecursive ?? [];
      Globals.mockConfiguration.operatorPendingModeKeyBindings =
        testObj.remaps?.operatorPendingModeKeyBindings ?? [];
      Globals.mockConfiguration.operatorPendingModeKeyBindingsNonRecursive =
        testObj.remaps?.operatorPendingModeKeyBindingsNonRecursive ?? [];
    } else {
      await parseVimRCMappings(testObj.remaps);
    }
  }

  const timeout = Globals.mockConfiguration.timeout;
  const timeoutOffset = timeout / 2;
  // Globals.mockConfiguration.timeout = timeout;

  await reloadConfiguration();

  for (const { step, index } of testObj.steps.map((value, i) => ({ step: value, index: i }))) {
    let keysPressed = step.keysPressed;
    if (process.platform === 'win32') {
      keysPressed = keysPressed.replace(/\\n/g, '\\r\\n');
    }

    // Parse current step
    helper.currentStep = index;
    helper.parseStep(testObj);

    const stepTitleOrIndex = step.title ? `nr. ${index} - "${step.title}"` : index;

    // Check valid step object input
    assert(helper.isValid, `Step ${stepTitleOrIndex} Missing '|' in test object.`);

    const jumpTracker = globalState.jumpTracker;
    jumpTracker.clearJumps();

    // Checks if this step should wait for timeout or not
    const waitsForTimeout = step.stepResult.endAfterTimeout !== undefined;

    type ResultType = {
      lines: string;
      position: vscode.Position;
      endMode: Mode;
    };

    const p1 = () => {
      return new Promise<ResultType>((p1Resolve, p1Reject) => {
        setTimeout(() => {
          // Get lines, position and mode after half timeout finishes
          p1Resolve({
            lines: modeHandler.vimState.document.getText(),
            position: modeHandler.vimState.editor.selection.start,
            endMode: modeHandler.currentMode,
          });
        }, timeoutOffset);
      });
    };

    const p2 = () => {
      return new Promise<ResultType | undefined>((p2Resolve, p2Reject) => {
        if (waitsForTimeout) {
          setTimeout(async () => {
            if (modeHandler.remapState.isCurrentlyPerformingRemapping) {
              // Performing a remapping, which means it started at the right time but it has not
              // finished yet (maybe the remapping has a lot of keys to handle) so we wait for the
              // remapping to finish
              const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
              while (modeHandler.remapState.isCurrentlyPerformingRemapping) {
                // Wait a little bit longer here because the currently performing remap might have
                // some remaining keys to handle after it finishes performing the remap and there
                // might even be there some keys still to be sent that might create another remap.
                // Example: if you have and ambiguous remap like 'ab -> abcd' and 'abc -> abcdef'
                // and an insert remap like 'jj -> <Esc>' and you press 'abjj' the first 'j' breaks
                // the ambiguity and makes the remap start performing, but when the remap finishes
                // performing there is still the 'jj' to be handled and remapped.
                await wait(10);
              }
            }
            // Get lines, position and mode after timeout + offset finishes
            p2Resolve({
              lines: modeHandler.vimState.document.getText(),
              position: modeHandler.vimState.editor.selection.start,
              endMode: modeHandler.currentMode,
            });
          }, timeout + timeoutOffset);
        } else {
          p2Resolve(undefined);
        }
      });
    };

    // Assumes key presses are single characters for now
    await modeHandler.handleMultipleKeyEvents(tokenizeKeySequence(keysPressed));

    // Only start the end check promises after the keys were handled to make sure they don't
    // finish before all the keys are pressed. The keys handler above will resolve when the
    // keys are handled even if it buffered some keys to wait for a timeout.
    const [result1, result2] = await Promise.all([p1(), p2()]);

    // Lines after keys pressed but before any timeout

    // Check given end output is correct
    const endLines = helper.asVimOutputText(false);
    assert.strictEqual(
      result1.lines,
      endLines.join(os.EOL),
      `Document content does not match on step ${stepTitleOrIndex}.`
    );

    // Check end cursor position
    const actualEndPosition = result1.position;
    const expectedEndPosition = helper.currentStepEndPosition;
    assert.deepStrictEqual(
      { line: actualEndPosition.line, character: actualEndPosition.character },
      { line: expectedEndPosition.line, character: expectedEndPosition.character },
      `Cursor position is wrong on step ${stepTitleOrIndex}.`
    );

    // endMode: check end mode is correct if given
    const expectedEndMode = step.stepResult.endMode;
    if (expectedEndMode !== undefined) {
      const actualMode = Mode[result1.endMode].toUpperCase();
      const expectedMode = Mode[expectedEndMode].toUpperCase();
      assert.strictEqual(
        actualMode,
        expectedMode,
        `Didn't enter correct mode on step ${stepTitleOrIndex}.`
      );
    }

    if (result2) {
      // After the timeout finishes (plus an offset to be sure it finished)
      assert.notStrictEqual(result2, undefined);

      // Check given endAfterTimeout output is correct
      const endAfterTimeoutLines = helper.asVimOutputText(true);
      assert.strictEqual(
        result2.lines,
        endAfterTimeoutLines.join(os.EOL),
        `Document content does not match on step ${stepTitleOrIndex} after timeout.`
      );

      // Check endAfterTimeout cursor position
      const actualEndAfterTimeoutPosition = result2.position;
      const expectedEndAfterTimeoutPosition = helper.currentStepEndAfterTimeoutPosition!;
      assert.deepStrictEqual(
        {
          line: actualEndAfterTimeoutPosition.line,
          character: actualEndAfterTimeoutPosition.character,
        },
        {
          line: expectedEndAfterTimeoutPosition.line,
          character: expectedEndAfterTimeoutPosition.character,
        },
        `Cursor position is wrong on step ${stepTitleOrIndex} after Timeout.`
      );

      // endMode: check end mode is correct if given
      const expectedEndAfterTimeoutMode = step.stepResult.endModeAfterTimeout;
      if (expectedEndAfterTimeoutMode !== undefined) {
        const actualMode = Mode[result2.endMode].toUpperCase();
        const expectedMode = Mode[expectedEndAfterTimeoutMode].toUpperCase();
        assert.strictEqual(
          actualMode,
          expectedMode,
          `Didn't enter correct mode on step ${stepTitleOrIndex} after Timeout.`
        );
      }
    }

    // jumps: check jumps are correct if given
    if (step.stepResult.jumps !== undefined) {
      assert.deepStrictEqual(
        jumpTracker.jumps.map((j) => endLines[j.position.line] || '<MISSING>'),
        step.stepResult.jumps.map((t) => t.replace('|', '')),
        'Incorrect jumps found'
      );

      const stripBar = (text: string | undefined) => (text ? text.replace('|', '') : text);
      const actualJumpPosition =
        (jumpTracker.currentJump && endLines[jumpTracker.currentJump.position.line]) || '<FRONT>';
      const expectedJumpPosition =
        stripBar(step.stepResult.jumps.find((t) => t.includes('|'))) || '<FRONT>';

      assert.deepStrictEqual(
        actualJumpPosition.toString(),
        expectedJumpPosition.toString(),
        `Incorrect jump position found on step ${stepTitleOrIndex}`
      );
    }
  }
  return modeHandler;
}

async function parseVimRCMappings(lines: string[]): Promise<void> {
  const config = Globals.mockConfiguration;

  // Remove all the old remappings from the .vimrc file
  VimrcImpl.removeAllRemapsFromConfig(config);

  const vscodeCommands = await vscode.commands.getCommands();
  // Add the new remappings
  for (const line of lines) {
    const remap = await vimrcKeyRemappingBuilder.build(line, vscodeCommands);
    if (remap) {
      VimrcImpl.addRemapToConfig(config, remap);
      continue;
    }
    const unremap = await vimrcKeyRemappingBuilder.buildUnmapping(line);
    if (unremap) {
      VimrcImpl.removeRemapFromConfig(config, unremap);
      continue;
    }
    const clearRemap = await vimrcKeyRemappingBuilder.buildClearMapping(line);
    if (clearRemap) {
      VimrcImpl.clearRemapsFromConfig(config, clearRemap);
      continue;
    }
  }
}

export { ITestObject, testIt };
