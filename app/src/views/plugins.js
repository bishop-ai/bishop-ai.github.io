angular.module('bishop_ai').controller('PluginsCtrl', [
    '$rootScope',
    '$scope',

    function ($rootScope,
              $scope) {

        $scope.plugins = BISHOP_AI.getPlugins();
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
            BISHOP_AI.updatePlugin(plugin.namespace, plugin);
            $rootScope.$broadcast("fire");
        };

        $scope.disablePlugin = function (plugin) {
            plugin.enabled = false;
            BISHOP_AI.updatePlugin(plugin.namespace, plugin);
            $rootScope.$broadcast("fire");
        };
    }
]);