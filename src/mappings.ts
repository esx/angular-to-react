

/* Case is significant. In Angular the event name is lowecase, in React 'on' + specified case.
    So 'keydown' in Angular and 'onKeyDown' in React. */
const eventNames = [
    'Copy',
    'Cut',
    'Paste',
    'CompositionEnd',
    'CompositionStart',
    'CompositionUpdate',
    'KeyDown',
    'KeyPress',
    'KeyUp',
    'Focus',
    'Blur',
    'Change',
    'Input',
    'Invalid',
    'Reset',
    'Submit',
    'Error',
    'Load',
    'Click',
    'ContextMenu',
    'DoubleClick',
    'Drag',
    'DragEnd',
    'DragEnter',
    'DragExit',
    'DragLeave',
    'DragOver',
    'DragStart',
    'Drop',
    'MouseDown',
    'MouseEnter',
    'MouseLeave',
    'MouseMove',
    'MouseOut',
    'MouseOver',
    'MouseUp',
    'PointerDown',
    'PointerMove',
    'PointerUp',
    'PointerCancel',
    'GotPointerCapture',
    'LostPointerCapture',
    'PointerEnter',
    'PointerLeave',
    'PointerOver',
    'PointerOut',
    'Select',
    'TouchCancel',
    'TouchEnd',
    'TouchMove',
    'TouchStart',
    'Scroll',
    'Wheel',
    'Abort',
    'CanPlay',
    'CanPlayThrough',
    'DurationChange',
    'Emptied',
    'Encrypted',
    'Ended',
    'Error',
    'LoadedData',
    'LoadedMetadata',
    'LoadStart',
    'Pause',
    'Play',
    'Playing',
    'Progress',
    'RateChange',
    'Seeked',
    'Seeking',
    'Stalled',
    'Suspend',
    'TimeUpdate',
    'VolumeChange',
    'Waiting',
    'Load',
    'Error',
    'AnimationStart',
    'AnimationEnd',
    'AnimationIteration',
    'TransitionEnd',
    'Toggle'];
/* Maps from Angular event names to React event names  */
export const eventNameMap =  new Map(eventNames.map(eventName => 
    [eventName.toLowerCase(), 'on' + eventName] as readonly [string, string]));

export const voidElements = new Set(
    ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/* Attributes where the camel case spelling is different from the lowercase 
    copied from here: https://reactjs.org/docs/dom-elements.html
    extracted with atts.split(/\s+/).filter(a => a != a.toLowerCase()).map(a => `'${a}',`).join('\n')
*/

// class/className is not included here since it is special-cased anyway
export const attributeDomAliases = new Map<string, string>([
    ['for', 'htmlFor']
]);

export const camelCaseAttributes = [
    /* HTML */
    'acceptCharset',
    'accessKey',
    'allowFullScreen',
    'autoComplete',
    'autoFocus',
    'autoPlay',
    'cellPadding',
    'cellSpacing',
    'charSet',
    'classID',
    'className',
    'colSpan',
    'contentEditable',
    'contextMenu',
    'controlsList',
    'crossOrigin',
    'dateTime',
    'encType',
    'formAction',
    'formEncType',
    'formMethod',
    'formNoValidate',
    'formTarget',
    'frameBorder',
    'hrefLang',
    'htmlFor',
    'httpEquiv',
    'inputMode',
    'keyParams',
    'keyType',
    'marginHeight',
    'marginWidth',
    'maxLength',
    'mediaGroup',
    'minLength',
    'noValidate',
    'radioGroup',
    'readOnly',
    'rowSpan',
    'spellCheck',
    'srcDoc',
    'srcLang',
    'srcSet',
    'tabIndex',
    'useMap',
    /* SVG  */
    'accentHeight',
    'alignmentBaseline',
    'allowReorder',
    'arabicForm',
    'attributeName',
    'attributeType',
    'autoReverse',
    'baseFrequency',
    'baseProfile',
    'baselineShift',
    'calcMode',
    'capHeight',
    'clipPath',
    'clipPathUnits',
    'clipRule',
    'colorInterpolation',
    'colorInterpolationFilters',
    'colorProfile',
    'colorRendering',
    'contentScriptType',
    'contentStyleType',
    'diffuseConstant',
    'dominantBaseline',
    'edgeMode',
    'enableBackground',
    'externalResourcesRequired',
    'fillOpacity',
    'fillRule',
    'filterRes',
    'filterUnits',
    'floodColor',
    'floodOpacity',
    'fontFamily',
    'fontSize',
    'fontSizeAdjust',
    'fontStretch',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'glyphName',
    'glyphOrientationHorizontal',
    'glyphOrientationVertical',
    'glyphRef',
    'gradientTransform',
    'gradientUnits',
    'horizAdvX',
    'horizOriginX',
    'imageRendering',
    'kernelMatrix',
    'kernelUnitLength',
    'keyPoints',
    'keySplines',
    'keyTimes',
    'lengthAdjust',
    'letterSpacing',
    'lightingColor',
    'limitingConeAngle',
    'markerEnd',
    'markerHeight',
    'markerMid',
    'markerStart',
    'markerUnits',
    'markerWidth',
    'maskContentUnits',
    'maskUnits',
    'numOctaves',
    'overlinePosition',
    'overlineThickness',
    'paintOrder',
    'pathLength',
    'patternContentUnits',
    'patternTransform',
    'patternUnits',
    'pointerEvents',
    'pointsAtX',
    'pointsAtY',
    'pointsAtZ',
    'preserveAlpha',
    'preserveAspectRatio',
    'primitiveUnits',
    'refX',
    'refY',
    'renderingIntent',
    'repeatCount',
    'repeatDur',
    'requiredExtensions',
    'requiredFeatures',
    'shapeRendering',
    'specularConstant',
    'specularExponent',
    'spreadMethod',
    'startOffset',
    'stdDeviation',
    'stitchTiles',
    'stopColor',
    'stopOpacity',
    'strikethroughPosition',
    'strikethroughThickness',
    'strokeDasharray',
    'strokeDashoffset',
    'strokeLinecap',
    'strokeLinejoin',
    'strokeMiterlimit',
    'strokeOpacity',
    'strokeWidth',
    'surfaceScale',
    'systemLanguage',
    'tableValues',
    'targetX',
    'targetY',
    'textAnchor',
    'textDecoration',
    'textLength',
    'textRendering',
    'underlinePosition',
    'underlineThickness',
    'unicodeBidi',
    'unicodeRange',
    'unitsPerEm',
    'vAlphabetic',
    'vHanging',
    'vIdeographic',
    'vMathematical',
    'vectorEffect',
    'vertAdvY',
    'vertOriginX',
    'vertOriginY',
    'viewBox',
    'viewTarget',
    'wordSpacing',
    'writingMode',
    'xChannelSelector',
    'xHeight',
    'xlinkActuate',
    'xlinkArcrole',
    'xlinkHref',
    'xlinkRole',
    'xlinkShow',
    'xlinkTitle',
    'xlinkType',
    'xmlnsXlink',
    'xmlBase',
    'xmlLang',
    'xmlSpace',
    'yChannelSelector',
    'zoomAndPan',
] 

export const caseMap = new Map(camelCaseAttributes.map(a => [a.toLowerCase(), a]));

export const nonStringAttributes = new Set<string>(
    ['size', 'colSpan', 'tabIndex', 'minLength', 'maxLength']);