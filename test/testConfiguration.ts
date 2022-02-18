import * as vscode from 'vscode';

import {
  IConfiguration,
  IDebugConfiguration,
  IHighlightedYankConfiguration,
  IKeyRemapping,
  IModeSpecificStrings,
} from '../src/configuration/iconfiguration';

export class Configuration implements IConfiguration {
  useSystemClipboard = false;
  useCtrlKeys = false;
  overrideCopy = true;
  textwidth = 80;
  hlsearch = false;
  ignorecase = true;
  smartcase = true;
  autoindent = true;
  joinspaces = true;
  camelCaseMotion = {
    enable: false,
  };
  replaceWithRegister = false;
  smartRelativeLine = false;
  sneak = false;
  sneakUseIgnorecaseAndSmartcase = false;
  sneakReplacesF = false;
  surround = false;
  argumentObjectSeparators = [','];
  argumentObjectOpeningDelimiters = ['(', '['];
  argumentObjectClosingDelimiters = [')', ']'];
  easymotion = false;
  easymotionMarkerBackgroundColor = '#0000';
  easymotionMarkerForegroundColorOneChar = '#ff0000';
  easymotionMarkerForegroundColorTwoChar = '#ffa500'; // Deprecated! Use the ones bellow
  easymotionMarkerForegroundColorTwoCharFirst = '#ffb400';
  easymotionMarkerForegroundColorTwoCharSecond = '#b98300';
  easymotionIncSearchForegroundColor = '#7fbf00';
  easymotionDimColor = '#59546d';
  easymotionMarkerWidthPerChar = 8; // Deprecated! No longer needed!
  easymotionDimBackground = true;
  easymotionMarkerFontFamily = 'Consolas'; // Deprecated! No longer needed!
  easymotionMarkerFontSize = '14'; // Deprecated! No longer needed!
  easymotionMarkerFontWeight = 'bold';
  easymotionMarkerMargin = 0; // Deprecated! No longer needed!
  easymotionKeys = 'hklyuiopnm,qwertzxcvbasdgjf;';
  autoSwitchInputMethod = {
    enable: false,
    defaultIM: '',
    switchIMCmd: '',
    obtainIMCmd: '',
  };
  timeout = 1000;
  maxmapdepth = 1000;
  showcmd = true;
  showmodename = true;
  leader = '//';
  history = 50;
  incsearch = true;
  inccommand = '' as const;
  startInInsertMode = false;
  statusBarColorControl = false;
  statusBarColors: IModeSpecificStrings<string | string[]> = {
    normal: ['#8FBCBB', '#434C5E'],
    insert: '#BF616A',
    visual: '#B48EAD',
    visualline: '#B48EAD',
    visualblock: '#A3BE8C',
    replace: '#D08770',
  };
  debug: IDebugConfiguration = {
    silent: false,
    loggingLevelForAlert: 'error',
    loggingLevelForConsole: 'warn',
  };
  searchHighlightColor = 'rgba(150, 150, 255, 0.3)';
  searchHighlightTextColor = '';
  searchMatchColor = 'rgba(255, 150, 150, 0.3)';
  searchMatchTextColor = '';
  substitutionColor = 'rgba(100, 255, 150, 0.3)';
  substitutionTextColor = '';
  highlightedyank: IHighlightedYankConfiguration = {
    enable: false,
    color: 'rgba(250, 240, 170, 0.5)',
    textColor: '',
    duration: 200,
  };
  tabstop = 2;
  editorCursorStyle = vscode.TextEditorCursorStyle.Line;
  expandtab = true;
  number = true;
  relativenumber = false;
  iskeyword = '/\\()"\':,.;<>~!@#$%^&*|+=[]{}`?-';
  matchpairs = '(:),{:},[:]';
  visualstar = false;
  mouseSelectionGoesIntoVisualMode = true;
  changeWordIncludesWhitespace = false;
  foldfix = false;
  disableExtension = false;
  enableNeovim = false;
  gdefault = false;
  substituteGlobalFlag = false; // Deprecated in favor of gdefault
  neovimPath = 'nvim';
  neovimUseConfigFile = false;
  neovimConfigPath = '';
  vimrc = {
    enable: false,
    path: '',
  };
  cursorStylePerMode: IModeSpecificStrings<string> = {
    normal: 'line',
    insert: 'block',
    visual: 'underline',
    visualline: 'line-thin',
    visualblock: 'block-outline',
    replace: 'underline-thin,',
  };
  insertModeKeyBindings: IKeyRemapping[] = [];
  insertModeKeyBindingsNonRecursive: IKeyRemapping[] = [];
  normalModeKeyBindings: IKeyRemapping[] = [];
  normalModeKeyBindingsNonRecursive: IKeyRemapping[] = [];
  operatorPendingModeKeyBindings: IKeyRemapping[] = [];
  operatorPendingModeKeyBindingsNonRecursive: IKeyRemapping[] = [];
  visualModeKeyBindings: IKeyRemapping[] = [];
  visualModeKeyBindingsNonRecursive: IKeyRemapping[] = [];
  commandLineModeKeyBindings: IKeyRemapping[] = [];
  commandLineModeKeyBindingsNonRecursive: IKeyRemapping[] = [];
  insertModeKeyBindingsMap: Map<string, IKeyRemapping> = new Map();
  normalModeKeyBindingsMap: Map<string, IKeyRemapping> = new Map();
  operatorPendingModeKeyBindingsMap: Map<string, IKeyRemapping> = new Map();
  visualModeKeyBindingsMap: Map<string, IKeyRemapping> = new Map();
  commandLineModeKeyBindingsMap: Map<string, IKeyRemapping> = new Map();
  whichwrap = 'b,s';
  wrapKeys = {};
  report = 2;
  digraphs = {};
  wrapscan = true;
  scroll = 20;
  startofline = true;
  showMarksInGutter = true;
  shell = '';
}
