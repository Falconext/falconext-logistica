// Metro configurado para monorepo pnpm.
// Sin esto, Metro resuelve dos instancias de React por los symlinks de pnpm
// y la app revienta con "Invalid hook call" al arrancar.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1) Vigilar todo el workspace (para deps hoisteadas en la raíz).
config.watchFolders = [workspaceRoot];

// 2) Buscar módulos primero en la app y luego en la raíz del monorepo.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3) Evitar que Metro suba por el árbol y encuentre copias duplicadas.
config.resolver.disableHierarchicalLookup = true;

// 4) Forzar una única copia de react / react-native (clave con pnpm).
config.resolver.extraNodeModules = {
  react: path.resolve(workspaceRoot, 'node_modules/react'),
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
};

module.exports = config;
