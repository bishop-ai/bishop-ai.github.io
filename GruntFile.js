module.exports = function (grunt) {
    'use strict';

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

    var toBrowserify = [
        "../bishop-ai-core/index.js",
        "../bishop-ai-coinflip/index.js",
        "../bishop-ai-smalltalk/index.js",
        "../bishop-ai-timer/index.js"
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
                src: libJs.concat(['app/bishop-ai.js', 'app/src/**/*.js']),
                dest: 'app/main.min.js'
            }
        },

        browserify: {
            dist: {
                options: {
                    banner: '/*! <%= pkg.name %> - v<%= pkg.version %> - ' + '<%= grunt.template.today("yyyy-mm-dd") %> */',
                    alias: {
                        'bishop-ai-core': '../bishop-ai-core/index.js',
                        'bishop-ai-coinflip': '../bishop-ai-coinflip/index.js',
                        'bishop-ai-smalltalk': '../bishop-ai-smalltalk/index.js',
                        'bishop-ai-timer': '../bishop-ai-timer/index.js'
                    }
                },
                src: toBrowserify,
                dest: 'app/bishop-ai.js'
            }
        },

        copy: {
            main: {
                files: [
                    { src: 'index.html', dest: 'debug.html' },
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
                    'debug.html': [
                        'app/lib.js',
                        'app/bishop-ai.js',
                        'app/src/**/*.js'
                    ]
                }
            }
        }
    });

    // Load the Grunt plugins
    grunt.loadNpmTasks('grunt-browserify');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-injector');

    // Runs unit tests
    grunt.registerTask('default', ['browserify', 'uglify', 'copy', 'concat', 'injector']);
};
