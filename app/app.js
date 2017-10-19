angular.module('AI', ['ngAnimate', 'ngRoute', 'ngSanitize']);

angular.module('AI').constant('version', "1.0.0");
angular.module('AI').constant('debugMode', 0);
angular.module('AI').constant('appName', 'Bishop AI');

angular.module('AI').factory('socket', ['socketFactory', function (socketFactory) {
    var socket = io.connect("https://davidpaulhamilton.net", {path: '/socket.io'});

    return socketFactory({
        ioSocket: socket
    });
}]);

angular.module('AI').config([
    '$httpProvider',
    '$routeProvider',

    function ($httpProvider,
              $routeProvider) {

        $httpProvider.interceptors.push('authenticationInterceptor');

        var originalWhen = $routeProvider.when;
        $routeProvider.when = function (path, route) {

            if (!route.resolve) {
                route.resolve = {};
            }

            angular.extend(route.resolve, {
                authCheck: ['authenticationService', function (authenticationService) {
                    return authenticationService.hasStateBeenAuthenticated();
                }]
            });

            return originalWhen.apply(this, [path, route]);
        };

        // Setup the Module routes mapping URLs to Controller/View
        $routeProvider
            .when('/', {
                templateUrl: 'app/views/interface.html',
                controller: 'InterfaceCtrl'
            })
            .when('/login', {
                templateUrl: 'app/views/auth.html',
                controller: 'AuthCtrl'
            })
            .when('/plugins', {
                templateUrl: 'app/views/plugins.html',
                controller: 'PluginsCtrl',
                resolve: {
                    plugins: ['$http', function ($http) {
                        return $http.get("https://davidpaulhamilton.net/bishop-ai/api/plugins").then(function (response) {
                            return response.data;
                        });
                    }]
                }
            })
            .when('/plugins/:name', {
                templateUrl: 'app/views/plugin.html',
                controller: 'PluginCtrl',
                resolve: {
                    plugin: ['$http', '$route', function ($http, $route) {
                        return $http.get("https://davidpaulhamilton.net/bishop-ai/api/plugins/" + $route.current.params.name).then(function (response) {
                            return response.data;
                        });
                    }]
                }
            });
    }
]);

angular.module('AI').run([
    '$rootScope',
    'appName',
    'authenticationService',

    function ($rootScope,
              appName,
              authenticationService) {

        $rootScope.appName = appName;
        $rootScope.logout = function () {
            authenticationService.logout();
        };
    }
]);

