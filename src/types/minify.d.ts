declare module 'minify' {

    function minify(path: string): Promise<string>;

    export = minify;

}