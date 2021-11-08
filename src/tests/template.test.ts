import { ComponentInfo, FileInfo, ProjectInfo } from '../componentInfo';
import { transformTemplateToTsx } from '../templates/parseTemplate';

function dummyComponentInfo() {
  const pi = new ProjectInfo(null as any, null as any, new Map());
  const fi = new FileInfo('foo.ts', pi);
  const ci = new ComponentInfo(fi, null as any, null as any);
  return ci;
}

function transform1(tmpl: string) {
  const ci = dummyComponentInfo();
  const tsx = transformTemplateToTsx(tmpl, '', ci);
  const code = tsx.trim().replace(/\s+/g, ' ');
  return {ci, code};
}
function transform(tmpl: string) {
  const {code} = transform1(tmpl);
  return code;
}
  /*
    HTML parsing
  */

  test('transform template', () => {
    const tmpl = `      <div>   Hello <b> world </b>   </div>`;
    const tsx = transformTemplateToTsx(tmpl, '', dummyComponentInfo());
    expect(tsx).toBe(`      <div>   Hello <b> world </b>   </div>`);
  });

  test('transform template - should use <> if multiple top-level nodes', () => {
    const tmpl = `
      <div>   Hello <b> world </b>   </div>
      <div>   Hello <b> world </b>   </div>
    `;
    const tsx = transformTemplateToTsx(tmpl, '', dummyComponentInfo());
    expect(tsx).toBe(`<>
      <div>   Hello <b> world </b>   </div>
      <div>   Hello <b> world </b>   </div>
    </>`);
  });

  test('transform self-closed tag', () => {
    const tmpl = `<col />`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<col />`);
  });

  test('transform empty tag - should be self closed', () => {
    const tmpl = `<img>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<img />`);
  });

  test('transform empty self-closed tag - should be self closed', () => {
    const tmpl = `<img />`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<img />`);
  });

  test('implicityly closed tag - should be explicitly closed', () => {
    const tmpl = `<tr><td>foo</tr>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<tr><td>foo</td></tr>`);
  });


  test('SVG', () => {
    const tmpl = `<svg><polyline points='0 11 15 0 30 11' /></svg>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<svg><polyline points='0 11 15 0 30 11' /></svg>`);
  });

  test('invalid template', () => {
    const tmpl = `<foo></bar>`;
    expect(()=>{transform(tmpl)}).toThrowError();
  });

  /*
    Structural directives
  */

  test('transform conditional', () => {
    const tmpl = `<div *ngIf="true">Hello</div>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<>{ true && ( <div>Hello</div>)} </>`);
  });

  test('transform conditional ng-container (multiple child elements - should be in <></>)', () => {
    const tmpl = `<ng-container *ngIf="true"><b>Hello</b><i>Hello</i></ng-container>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<>{ true && ( <><b>Hello</b><i>Hello</i></>)} </>`);
  });

  test('transform conditional directive on ng-template', () => {
    const tmpl = `<ng-template [ngIf]="true"><b>Hello</b></ng-template>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<>{ true && ( <b>Hello</b>)} </>`);
  });

  test('ng-template should not be rendered by default', () => {
    const tmpl = `<ng-template><b>Hello</b></ng-template>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<></>`);
  });

  test('transform conditional ng-container', () => {
    const tmpl = `<ng-container *ngIf="true"><div>Hello</div></ng-container>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<>{ true && ( <div>Hello</div>)} </>`);
  });

  test('transform ngFor', () => {
    const tmpl = `<div *ngFor="let foo of bar">Hello</div>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<>{(bar).map(foo => ( <div>Hello</div>))} </>`);
  });

  test('transform ngFor on self-closed tag', () => {
    const tmpl = `<col *ngFor="let foo of bar" />`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<>{(bar).map(foo => ( <col />))} </>`);
  });

  test('transform switch on ng-container', () => {
    const tmpl = `<ng-container [ngSwitch]="7"><div *ngSwitchCase="7">Hello</div></ng-container>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<>{(()=>{ switch (7) {case 7: return ( <div>Hello</div>); }})()} </>`);
  });

  test('transform switch on element', () => {
    const tmpl = `<span [ngSwitch]="7"><div *ngSwitchCase="7">Hello</div></span>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<span>{(()=>{ switch (7) {case 7: return ( <div>Hello</div>); }})()} </span>`);
  });

  test('switch - multiple cases', () => {
    const tmpl = `<span [ngSwitch]="7"><div *ngSwitchCase="7">Hello</div><div *ngSwitchCase="8">Hello</div> </span>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<span>{(()=>{ switch (7) {case 7: return ( <div>Hello</div>); case 8: return ( <div>Hello</div>); }})()} </span>`);
  });

  test('switch - with default', () => {
    const tmpl = `<span [ngSwitch]="7"><div *ngSwitchCase="7">Hello</div><div *ngSwitchDefault>Hello</div></span>`;
    const actual = transform(tmpl);
    expect(actual).toBe(`<span>{(()=>{ switch (7) {case 7: return ( <div>Hello</div>); default: return ( <div>Hello</div>); }})()} </span>`);
  });


  /*
    Interpolations

  */
test('transform interpolation and pipe', () => {
  const tmpl = `<span> Bim #{{ix+1}} {{ 'fu_fa' | zap }} </span>`;
  const actual = transform(tmpl);
  expect(actual).toBe(`<span> Bim #{ix+1} {zap('fu_fa')} </span>`);
});

test('interpolation in attribute', () => {
  const tmpl = `<div id="foo{{ix}}"></div>`;
  const actual = transform(tmpl);
  expect(actual).toBe('<div id={`foo${ix}`}></div>');
});

/*
  Pipe
*/

test('pipe in container', () => {
  const tmpl = `<ng-container *ngFor="let foo of bar | keyvalue"><div>Hello</div></ng-container>`;
  const actual = transform(tmpl);
  expect(actual).toBe('<>{(keyvalue(bar)).map(foo => ( <div>Hello</div>))} </>');
});

test('chained pipes', () => {
  const tmpl = `<div>{{birthday | date | uppercase}}</div>`;
  const actual = transform(tmpl);
  expect(actual).toBe('<div>{uppercase(date(birthday))}</div>');
});

test('configured pipes', () => {
  /*
    Using the configured 'uppercase' pipe 
    - should import the required library
  */
  const tmpl = `<div>{{foo | uppercase}}</div>`;
  const {ci, code} = transform1(tmpl);
  expect(code).toBe('<div>{uppercase(foo)}</div>');
  expect(ci.fileInfo.additionalImports.size).toBe(1);
  const key1 = Array.from(ci.fileInfo.additionalImports.keys())[0];
  expect(key1).toBe('pipes.ts');
  const value = ci.fileInfo.additionalImports.get(key1);
  expect(value).toEqual(new Set(['uppercase']));
});

/*
  Attributes
*/

test('transform class attributes', () => {
  const tmpl = `<div [class.foo]="bar" [class.baz]="wawa" class="bux">Hello</div>`;
  const actual = transform(tmpl);
  expect(actual).toBe(`<div className={'bux' + (bar ? ' foo' : '') + (wawa ? ' baz' : '')}>Hello</div>`);
});

test('transform style attributes', () => {
  const tmpl = `<div [style.top.px]="y" [style.left.px]="x" style="font-weight: bold;">Hello</div>`;
  const actual = transform(tmpl);
  expect(actual).toBe(`<div style={{fontWeight: 'bold', top: y, left: x}}>Hello</div>`);
});

test('transform to camelCased attributes', () => {
  const tmpl = `<div colspan="6" tabindex="1" minlength='1' maxlength="6">Hello</div>`;
  const actual = transform(tmpl);
  expect(actual).toBe(`<div colSpan={6} tabIndex={1} minLength={1} maxLength={6}>Hello</div>`);
});

test('transform SVG kebabk-case attributes', () => {
  const tmpl = `<line stroke-width='4'></line>`;
  const actual = transform(tmpl);
  expect(actual).toBe(`<line strokeWidth='4'></line>`);
});

test('set innerhtml', () => {
  const tmpl = `<div [innerHTML]="inject"></div>`;
  const actual = transform(tmpl);
  expect(actual).toBe(`<div dangerouslySetInnerHTML={{__html: inject }}></div>`);
});

test('special case attributes (data, aria)', () => {
  const tmpl = `<div data-bs-toggle="dropdown" aria-expanded="false"></div>`;
  const actual = transform(tmpl);
  expect(actual).toBe(`<div data-bs-toggle='dropdown' aria-expanded='false'></div>`);
});




/* output bindings */

test('transform output binding', () => {
  const tmpl = `<div (onSelectMission)="selectMission()">Hello</div>`;
  const actual = transform(tmpl);
  expect(actual).toBe(`<div onSelectMission={()=>selectMission()}>Hello</div>`);
});

test('transform output binding with $event arg', () => {
  const tmpl = `<div (onSelectMission)="selectMission($event)">Hello</div>`;
  const actual = transform(tmpl);
  expect(actual).toBe(`<div onSelectMission={($event)=>selectMission($event)}>Hello</div>`);
});

