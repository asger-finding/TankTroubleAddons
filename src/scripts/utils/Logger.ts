import Browser from './Browser.js';

export default class Logger {
    static time(colour: string, ...args: string[]) {
        const date: Date           = new Date();
        const styling:string[]     = args.splice(1);
        const hours: string        = (date.getHours() + '').padStart(2, '0');
        const minutes: string      = (date.getMinutes() + '').padStart(2, '0');
        const seconds: string      = (date.getSeconds() + '').padStart(2, '0');
        const milliseconds: string = (date.getMilliseconds() + '');
        return [ (`%c${ hours }:${ minutes }:${ seconds }.${ milliseconds }`)
            .toString()
            .padEnd(14, '0') + '%c ' + args.join(''),
            'color: ' + colour, 'color: ' + Browser.devtools.font_default, ...styling ];
    }

    static log(...args: string[]) {
        console.log(...Logger.time(Browser.devtools.font_dark, ...args));
    }

    static error(...args: string[]) {
        console.error(...Logger.time(Browser.devtools.font_error, ...args));
    }

    static warn(...args: string[]) {
        console.warn(...Logger.time(Browser.devtools.font_warn, ...args));
    }

    static trace(...args: string[]) {
        console.trace(...Logger.time(Browser.devtools.font_dark, ...args));
    }

    static detailedLog(trace: string | null, ...args: string[]) {
        console.groupCollapsed(...Logger.time(Browser.devtools.font_dark, ...args));
        console.trace(trace);
        console.groupEnd();
    }
}
