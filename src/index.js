import {extname, basename, dirname} from 'path';

const BUILTIN_COMPONENT_REGEX = /^[a-z]+$/;
const DATA_ATTRIBUTE = 'data-component';

export default function babelPluginReactComponentDataAttribute({types: t}) {
  function createAttribute(name) {
    return t.jSXAttribute(t.jSXIdentifier(DATA_ATTRIBUTE), t.stringLiteral(name));
  }

  function nameForReactComponent(path, file) {
    const {opts: {filename}} = file;
    const {parentPath, node: {id}} = path;

    if (t.isIdentifier(id)) {
      return id.name;
    }

    if (parentPath.isVariableDeclarator()) {
      return parentPath.node.id.name;
    }

    if (filename === 'unknown') { return null; }

    const componentFileName = basename(filename, extname(filename));
    return componentFileName === 'index'
      ? basename(dirname(filename))
      : componentFileName;
  }

  const returnStatementVisitor = {
    JSXElement(path, {name}) {
      // We never want to go into a tree of JSX elements, only ever process the top-level item
      path.skip();

      const openingElement = path.get('openingElement');
      const {node} = openingElement;
      if (!t.isJSXIdentifier(node.name) || !BUILTIN_COMPONENT_REGEX.test(node.name.name)) { return; }

      node.attributes.push(createAttribute(name));
    },
  };

  const renderMethodVisitor = {
    ReturnStatement(path, {name}) {
      path.traverse(returnStatementVisitor, {name});
    },
  };

  return {
    name: 'babel-plugin-react-component-data-attribute',
    visitor: {
      'ClassDeclaration|ClassExpression': (path, state) => {
        const name = nameForReactComponent(path, state.file);
        if (name == null) { return; }

        path
          .get('body.body')
          .filter((bodyPath) => bodyPath.isClassMethod() && bodyPath.get('key').isIdentifier({name: 'render'}))
          .forEach((renderPath) => {
            renderPath.traverse(renderMethodVisitor, {name});
          });
      },
      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression': (path, state) => {
        const name = nameForReactComponent(path, state.file);
        if (name == null) { return; }

        if (path.isArrowFunctionExpression() && !path.get('body').isBlockStatement()) {
          path.traverse(returnStatementVisitor, {name});
        } else {
          path.traverse(renderMethodVisitor, {name});
        }
      },
    },
  };
}
