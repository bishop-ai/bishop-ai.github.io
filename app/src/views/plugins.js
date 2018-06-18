angular.module('bishop_ai').controller('PluginsCtrl', [
    '$rootScope',
    '$scope',
    'bishopAiSession',

    function ($rootScope,
              $scope,
              bishopAiSession) {

        $scope.plugins = bishopAiSession.getPlugins();
        $scope.availablePackages = [];
        $scope.saving = false;
        $scope.filter = "";

        $scope.tabs = [
            {name: "Installed Plugins", active: true}
        ];

        $scope.setActiveTab = function (index) {
            var i;
            for (i = 0; i < $scope.tabs.length; i++) {
                $scope.tabs[i].active = false;
            }
            $scope.tabs[index].active = true;
        };

        $scope.enablePlugin = function (plugin) {
            plugin.enabled = true;
            bishopAiSession.updatePlugin(plugin.namespace, plugin);
            $rootScope.$broadcast("fire");
        };

        $scope.disablePlugin = function (plugin) {
            plugin.enabled = false;
            bishopAiSession.updatePlugin(plugin.namespace, plugin);
            $rootScope.$broadcast("fire");
        };
    }
]);