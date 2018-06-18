var bishopAi = require('bishop-ai-core');

angular.module('bishop_ai', ['ngAnimate', 'ngRoute', 'ngSanitize']);

angular.module('bishop_ai').constant('version', "0.3.0");
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
                    plugin: ['$route', 'bishopAiSession', function ($route, bishopAiSession) {
                        return bishopAiSession.getPlugin($route.current.params.namespace);
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
    }
]);

angular.module('bishop_ai').factory('bishopAiSession', [

    function () {
        var bishopAiSession = bishopAi.startSession();
        bishopAiSession.link("user1");
        return bishopAiSession;
    }
]);

// Load initial config before angular app is run.
(function () {
    var coinflip = require('bishop-ai-coinflip');
    var smalltalk = require('bishop-ai-smalltalk');
    var timer = require('bishop-ai-timer');

    bishopAi.loadConfig({
        enabledPlugins: {
            "coinflip": true,
            "timer": true,
            "smalltalk": true
        }
    });

    bishopAi.registerPlugin(coinflip);
    bishopAi.registerPlugin(smalltalk);
    bishopAi.registerPlugin(timer);
})();

