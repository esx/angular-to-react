declare enum ChangeDetectionStrategy {
    OnPush = 0,
    Default = 1
}

export interface Directive {
    selector?: string;
    inputs?: string[];
    outputs?: string[];
    providers?: any[];
    exportAs?: string;
    queries?: {
        [key: string]: any;
    };
    host?: {
        [key: string]: string;
    };
    jit?: true;
}
export interface Component extends Directive {
    changeDetection?: ChangeDetectionStrategy;
    viewProviders?: any[];
    moduleId?: string;
    templateUrl?: string;
    template?: string;
    styleUrls?: string[];
    styles?: string[];
    animations?: any[];
    encapsulation?: any;
    interpolation?: [string, string];
    entryComponents?: any;
    preserveWhitespaces?: boolean;
}