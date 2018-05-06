angular.module('bishop_ai', ['ngAnimate', 'ngRoute', 'ngSanitize']);

angular.module('bishop_ai').constant('version', "1.0.0");
angular.module('bishop_ai').constant('debugMode', 0);
angular.module('bishop_ai').constant('appName', 'Bishop AI');

angular.module('bishop_ai').config([
    '$routeProvider',

    function ($routeProvider) {

        // Setup the Module routes mapping URLs to Controller/View
        $routeProvider
            .when('/', {
                templateUrl: 'app/src/views/interface.html',
                controller: 'InterfaceCtrl'
            })
            .when('/plugins', {
                templateUrl: 'app/src/views/plugins.html',
                controller: 'PluginsCtrl'
            })
            .when('/plugins/:namespace', {
                templateUrl: 'app/src/views/plugin.html',
                controller: 'PluginCtrl',
                resolve: {
                    plugin: ['$route', function ($route) {
                        return BISHOP_AI.getPlugin($route.current.params.namespace);
                    }]
                }
            });
    }
]);

angular.module('bishop_ai').run([
    '$rootScope',
    'appName',

    function ($rootScope,
              appName) {

        $rootScope.appName = appName;
        BISHOP_AI.startSession();
        BISHOP_AI.linkSession("user1");
    }
]);

// Load initial config before angular app is run.
(function () {
    BISHOP_AI.loadConfig({
        enabledPlugins: {
            "coinflip": true,
            "timer": true,
            "smalltalk": true
        }
    });
})();

