const { src, dest, task, watch: fileWatch, series, parallel } = require('gulp');
const argv         = require('yargs').argv;
const package      = require('./package.json');
const del          = require('del');
const changed      = require('gulp-changed');
const ts           = require('gulp-typescript');
const terser       = require('gulp-terser');
const sourcemaps   = require('gulp-sourcemaps');
const postCSS      = require('gulp-postcss');
const sass         = require('gulp-sass')(require('sass'));
const autoprefixer = require('autoprefixer');
const cssnano      = require('cssnano');
const htmlmin      = require('gulp-htmlmin');
const imagemin     = require('gulp-imagemin');
const jeditor      = require('gulp-json-editor');
const yaml         = require('gulp-yaml');

const tsProject = ts.createProject('./tsconfig.json');
const origin    = './src';
const build     = './build';
const dist      = './dist';
const paths = {
    manifest: `${origin}/manifest.yml`,
    files: {
        js:     `${origin}/**/*.@(js|ts)`,
        css :   `${origin}/css/*.@(css|scss)`,
        html:   `${origin}/html/*.html`,
        images: `${origin}/assets/@(images|svg)/*.@(png|jpg|jpeg|gif|svg)`,
        json:   `${origin}/**/*.json`
    }
}
const state = {
    DEV:        'development',
    WATCH:      'watch',
    PRODUCTION: 'production',
	DEFAULT:    'default',
    get current() {
        return argv.state || this[this.DEFAULT];
    },
    get rel() {
		return this.current === this.PRODUCTION;
    },
	get dest() {
		return this.rel ? dist : build;
	}
}

function scripts() {
    let source = src(paths.files.js)
        .pipe(changed(state.dest))
        .pipe(tsProject());
        state.rel && source.pipe(sourcemaps.init())
            .pipe(terser())
            .pipe(sourcemaps.write('.'));
    return source.pipe(dest(state.dest));
}

function css() {
    const plugins = [
        autoprefixer(),
        ... state.rel ?  [ cssnano() ] : []
    ]
    return src(paths.files.css)
        .pipe(changed(state.dest + '/css'))
        .pipe(sass())
        .pipe(postCSS(plugins))
        .pipe(dest(state.dest + '/css'));
}

function html() {
    const source = src(paths.files.html)
        .pipe(changed(state.dest));
        state.rel && source.pipe(htmlmin({ collapseWhitespace: true }))
	return source.pipe(dest(state.dest));
}

function images() {
    const source = src(paths.files.images)
        .pipe(changed(state.dest + '/assets'));
        state.rel && source.pipe(imagemin());
	return source.pipe(dest(state.dest + '/assets'));	
}

function json() {
    return src(paths.files.json)
        .pipe(changed(state.dest))
		.pipe(jeditor(json=>{return json}, { beautify: !state.rel }))
        .pipe(dest(state.dest));
}

function manifest() {
    return src(paths.manifest)
        .pipe(changed(state.dest))
        .pipe(yaml({ schema: 'DEFAULT_FULL_SCHEMA' }))
        .pipe(dest(state.dest));       
}

function clean() {
    return del([ dist, build ], { force: true });
}

function watch() {
    fileWatch(paths.files.js, scripts);
    fileWatch(paths.files.css, css);
    fileWatch(paths.files.html, html);
    fileWatch(paths.files.images, images);
    fileWatch(paths.files.json, json);
}

task('clean', clean);
task('build', parallel(scripts, css, html, images, json, manifest));
task('watch', series('clean', 'build', watch));
exports.default = series('clean', 'build');
exports.watch = series('clean', 'build', 'watch');
exports.clean = clean;