module.exports = function (grunt) {
    'use strict';

    /**
     * Every folder that contains JavaScript files that need to be included in the app (that are not 3rd party libs)
     * must be added here.
     **/
    var srcJs = [
        "app/src/**/*.js"
    ];

    /**
     * All JavaScript Library files should be included here. If a file is added or removed, it needs to be added/removed
     * here as well. This is order dependant for example: jQuery is defined before Angular so that Angular uses the full
     * jQuery library rather than its subset and all other libraries that depend on jQuery are defined after jQuery.
     *
     **/
    var libJs = [
        "node_modules/jquery/dist/jquery.min.js",
        "node_modules/bootstrap/dist/js/bootstrap.min.js",
        "node_modules/angular/angular.min.js",
        "node_modules/angular-route/angular-route.min.js",
        "node_modules/angular-animate/angular-animate.min.js",
        "node_modules/angular-sanitize/angular-sanitize.min.js",
        "node_modules/particles.js/particles.js"
    ];

    var bootstrap = [
        "./node_modules/bootstrap/dist/css/bootstrap.min.css",
        "./node_modules/bootstrap/dist/css/bootstrap-theme.min.css"
    ];
    var bootstrapFonts = [
        "./node_modules/bootstrap/dist/fonts/*"
    ];

    var toCopy = [
        "bishop-ai-core/dist/bishop-ai-core.min.js",
        "bishop-ai-core/dist/bishop-ai-core.js",
        "bishop-ai-coinflip/index.js",
        "bishop-ai-smalltalk/index.js",
        "bishop-ai-timer/index.js"
    ];

    var toInject = [
        "app/main.min.js",
        "app/bishop-ai-core/dist/bishop-ai-core.min.js",
        "app/bishop-ai-coinflip/index.js",
        "app/bishop-ai-smalltalk/index.js",
        "app/bishop-ai-timer/index.js"
    ];

    var toInjectDebug = [
        "app/lib.js",
        "app/src/**/*.js",
        "app/bishop-ai-core/dist/bishop-ai-core.js",
        "app/bishop-ai-coinflip/index.js",
        "app/bishop-ai-smalltalk/index.js",
        "app/bishop-ai-timer/index.js"
    ];

    // Setup Grunt tasks
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        uglify: {
            main: {
                options: {
                    mangle: false, // Set this to true to obfuscate the codebase. This also minimizes file size transferred.
                    banner: '/*! <%= pkg.name %> <%= grunt.template.today("dd-mm-yyyy") %> */\n',
                    sourceMap: false
                },
                src: libJs.concat(srcJs),
                dest: 'app/main.min.js'
            }
        },

        copy: {
            main: {
                files: [
                    { src: 'index.html', dest: 'debug.html' },
                    { expand: true, cwd: '../', src: toCopy, dest: './app/' },
                    { expand: true, src: bootstrap, dest: './app/src/styles/', flatten: true },
                    { expand: true, src: bootstrapFonts, dest: './app/src/styles/fonts', flatten: true }
                ]
            }
        },

        concat: {
            main: {
                src: libJs,
                dest: 'app/lib.js'
            }
        },

        injector: {
            main: {
                options: {
                    addRootSlash: false
                },
                files: {
                    'index.html': toInject,
                    'debug.html': toInjectDebug
                }
            }
        }
    });

    // Load the Grunt plugins
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-injector');

    // Runs unit tests
    grunt.registerTask('default', ['uglify', 'copy', 'concat', 'injector']);
};
