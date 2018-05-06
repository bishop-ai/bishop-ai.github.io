angular.module('bishop_ai').controller('PluginCtrl', [
    '$rootScope',
    '$scope',
    '$interpolate',
    'plugin',

    function ($rootScope,
              $scope,
              $interpolate,
              plugin) {

        $scope.plugin = plugin;
        $scope.saving = false;

        $scope.updatePluginOptions = function () {
            BISHOP_AI.updatePlugin($scope.plugin.namespace, $scope.plugin);
            $rootScope.$broadcast("fire");
        };

        $scope.enablePlugin = function () {
            $scope.plugin.enabled = true;
            BISHOP_AI.updatePlugin($scope.plugin.namespace, $scope.plugin);
            $rootScope.$broadcast("fire");
        };

        $scope.disablePlugin = function () {
            $scope.plugin.enabled = false;
            BISHOP_AI.updatePlugin($scope.plugin.namespace, $scope.plugin);
            $rootScope.$broadcast("fire");
        };

        $scope.startOauth = function (option) {
            var url = $interpolate(option.oauth.url)($scope);

            var width = 450,
                height = 730,
                left = (screen.width / 2) - (width / 2),
                top = (screen.height / 2) - (height / 2);

            window.addEventListener("message", function (event) {
                $scope.$apply(function () {
                    var params = JSON.parse(event.data);
                    if (params[option.oauth.urlParam]) {
                        option.value = params[option.oauth.urlParam];
                    }
                });
            }, false);

            window.open(url,
                'OAuth Authentication',
                'menubar=no,location=no,resizable=no,scrollbars=no,status=no, width=' + width + ', height=' + height + ', top=' + top + ', left=' + left
            );
        };
    }
]);