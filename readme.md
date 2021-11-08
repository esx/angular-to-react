# Angular To React

Transforms an Angular project into a React project. 

# Caveats

This is not a plug-and-play solution. Significant manual work will still be required for any non-trivial project. This tool only helps with the manual drudgery of transforming syntax. 

1. Angular and React are suffiencetly different that a fully automated transformation is not possible. In particular state-managment need to be carefully reviewed manually.
Angular also have stuff like services and pipes which have no direct equivalent in React.

2. This code was developed in order to migrate a particular project and only handles patterns which was used in that project. Other Angular project might need extensions to the code. This code is only presented as a starting point.

# Principles
 
An Angular component class is transformed into a React function component:

* `@Input()` decorated members are turned into props. 
* `@Output()` members are turned into props with function types.
* `readonly` members are turned into consts. 
* Other members are turned into state fields. 
* Assignments to state members are turned into setState() calls.  
* Constructor code is inlined in the state initializer call. (This will need to be manually reviewed.)
* Constructor arguments are trasformed into useContext statements, although that can be configured by type in config/injections.ts
* Comments and whitespace is generally preserved through the transformation.

Templates are transformed into tsx syntax:

* `ngIf` into boolean shortcuts, e.g. `<foo *ngIf="bar" />` into  `{bar ?? <foo />}`
* `ngFor` into map, e.g. `<foo ngFor="let item of baz">` into  `{baz.map(item => <foo />)}`
* `ngSwitch`/`ngSwitchCase` into a JavaScript `switch`-statement embedded in an immediately-executed function. This is ugly but works. You might want to extract into a named function to make the tsx more readable.  
* Attributes transformed as you would expect.
* pipe expressions are transformed into function calls, e.g. `{{foo | uppercase}}` into `{uppercase(foo)}`. This is configurable in configs/pipes.ts, where alternative transformation can be configured. 


# How to use:
First create a react typescript project somewhere:

        npx create-react-app my-app --template typescript

Then checkout this project somewhere, and modify the 'migration.ts' file to point to src-folder the old Angluar project, and the src-folder of the newly created React project. Then run 

        npm run start

 in the root of this project.