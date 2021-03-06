const fs = require('fs');
const glob = require('glob');
const merge = require('webpack-merge');
const path = require('path');
const url = require('url');
const webpack = require('webpack');

const CopyWebpackPlugin = require('copy-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const WriteFileWebpackPlugin = require('write-file-webpack-plugin');

const getLessVariables = require('./lib/getLessVariables');
const getRequireJSConfig = require('./lib/getRequireJSConfig');
const resolveResource = require('./lib/resolveResource');

function AddToContextPlugin(condition, extras) {
  this.condition = condition;
  this.extras = extras || [];
}

// http://stackoverflow.com/questions/30065018/
// dynamically-require-an-aliased-module-using-webpack
AddToContextPlugin.prototype.apply = function (compiler) {
  const condition = this.condition;
  const extras = this.extras;
  var newContext = false;
  compiler.plugin('context-module-factory', function (cmf) {
    cmf.plugin('after-resolve', function (items, callback) {
      newContext = true;
      return callback(null, items);
    });
    // this method is called for every path in the ctx
    // we just add our extras the first call
    cmf.plugin('alternatives', function (items, callback) {
      if (newContext && items[0].context.match(condition)) {
        newContext = false;
        var alternatives = extras.map(function (extra) {
          return {
            context: items[0].context,
            request: extra
          };
        });
        items.push.apply(items, alternatives);
      }
      return callback(null, items);
    });
  });
};

// Plugin defaults, also available at PloneWebpackPlugin.defaults
const defaults = {
  portalUrl: 'http://localhost:8080/Plone',
  sourcePath: null,
  publicPath: '/Plone/++theme++webpack/',
  resolveExtensions: ['.js', ''],
  resolveBlacklist: [
    'events',
    'layouts-editor',
    'plone',
    'translate'
  ],
  resolveMapping: {
    './jqtree-circle.png': './components/jqtree/jqtree-circle.png'
  },
  ignore: null,
  debug: false
};

// Helper for choosing between given options and defaults
function option(options, name, defaults) {
  return options && options[name] ? options[name] : defaults[name];
}

// Helper for passing options query for webpack loaders
function q(loader, query, portalUrl) {
    return loader + "?" + JSON.stringify(query).replace(
        // Trick webpack to resolve full portal paths (e.g. for fonts)
        new RegExp(portalUrl + '/', 'g'), '');
}

function PloneWebpackPlugin(options) {
  this.portalUrl = option(options, 'portalUrl', defaults);
  this.resolveExtensions = option(options, 'resolveExtensions', defaults);
  this.resolveBlacklist = option(options, 'resolveBlacklist', defaults);
  this.resolveMapping = option(options, 'resolveMapping', defaults);
  this.debug = option(options, 'debug', defaults);

  const sourcePath = option(options, 'sourcePath', defaults);
  const publicPath = option(options, 'publicPath', defaults);
  const less = getLessVariables(this.portalUrl);
  const config = getRequireJSConfig(this.portalUrl);

  // List of theme templates to run through HTML webpack plugin
  const basename = path.basename(sourcePath);
  const templates = glob.sync(path.join(sourcePath, '**', '?(*.html|manifest.cfg)'));

  // List of ignore globs to skips on copy plugin
  const ignore = option(options, 'ignore', { ignore: [
    path.join(basename, '?(*.js|*.jsx|*.css|*.less|*.scss)')
  ]}).concat(templates.map(function(filename) {
    return filename.substring(sourcePath.length - basename.length);
  }));

  // Pre-configure loaders
  this.loaders = {

    url: {
      test: /\.(png|gif|jpg|otf|eot|svg|ttf|woff|woff2)(\?.*)?$/,
      loader: 'url', query: { limit: 8192 }
    },

    extract: {
      css: {
        test: /\.css$/i,
        loader: ExtractTextPlugin.extract(['css'])
      },
      less: {
        test: /\.less$/i,
        loader: ExtractTextPlugin.extract([
          'css', q('less', { globalVars: less.globalVars },
                   this.portalUrl)
        ])
      },
      scss: {
        test: /\.scss$/i,
        loader: ExtractTextPlugin.extract(['css', 'fast-sass'])
      },
    },

    css: {
      test: /\.css$/i,
      loaders: ['style', 'css']
    },

    less: {
      test: /\.less$/i,
      loaders: [
        'style', 'css', q('less', { globalVars: less.globalVars },
                          this.portalUrl)
      ]
    },

    scss: {
      test: /\.scss$/i,
      loaders: ['style', 'css', 'fast-sass']
    },

    shim: {

      ace: {
        test: /mockup\/texteditor\/pattern(.js)?$/,
        loader: 'imports?ace=ace,_a=ace/mode/javascript,_b=ace/mode/text,_c=ace/mode/css,_d=ace/mode/html,_e=ace/mode/xml,_f=ace/mode/less,_g=ace/mode/python,_h=ace/mode/xml,_i=ace/mode/ini'
      },

      backbone: {
        test: /backbone\.paginator(.js)?$/,
        loader: 'imports?jQuery=jquery,_=underscore,Backbone=backbone'
      },

      bootstraptransition : {
        test: /bootstrap\/js\/transition(.js)?$/,
        loader: 'imports?jQuery=jquery!exports?window.jQuery.support.transition'
      },

      bootstrapcollapse: {
        test: /bootstrap\/js\/collapse(.js)?$/,
        loader: 'imports?jQuery=jquery'
      },

      bootstraptooltip: {
        test: /bootstrap\/js\/tooltip(.js)?$/,
        loader: 'imports?jQuery=jquery'
      },

      bootstrapdropdown : {
        test: /bootstrap\/js\/dropdown(.js)?$/,
        loader: 'imports?jQuery=jquery'
      },

      bootstrapalert : {
        test: /bootstrap\/js\/alert(.js)?$/,
        loader: 'imports?jQuery=jquery'
      },

      jqtree: {
        test: /jqtree\/(tree\.jquery|node|lib\/.*)(.js)?$/,
        loader: 'imports?jQuery=jquery,$=jquery,this=>{jQuery:$}'
      },

      recurrenceinput: {
        test: /jquery\.recurrenceinput(.js)?$/,
        loader: 'imports?jQuery=jquery,tmpl=jquery.tmpl,_overlay=resource-plone-app-jquerytools-js,_dateinput=resource-plone-app-jquerytools-dateinput-js'
      },

      tinymce: {
        test: /tinymce(.js)?$/,
        loader: 'imports?document=>window.document,this=>window!exports?window.tinymce'
      },

      tinymceplugins: {
        test: /tinymce\/plugins.*(.js)?$/,
        loader: 'imports?tinymce,this=>{tinymce:tinymce}'
      },

      jqueryeventdrop: {
        test: /jquery\.event\.drop(.js)?$/,
        loader: 'imports?jQuery=jquery!exports?jQuery.drop'
      },

      jqueryeventdrag: {
        test: /jquery\.event\.drag(.js)?$/,
        loader: 'imports?jQuery=jquery!exports?jQuery.drag'
      },

      jquerytmpl: {
        test: /jquery\.tmpl(.js)?$/,
        loader: 'imports?jQuery=jquery,$=jquery!exports?jQuery.tmpl'
      },

      jquerycookie: {
        test: /jquery\.cookie(.js)?$/,
        loader: 'imports?jQuery=jquery,$=jquery!exports?jQuery.cookie'
      },

      mockuputils: {
        test: /mockupjs\/utils/,
        loader: 'imports?jQuery=jquery,$=jquery'
      },

      // Hack to work around webpack confusing fallback jquery define
      plone: {
        test: /\+\+resource\+\+plone(.js)?$/,
        loader: 'imports?__WEBPACK_LOCAL_MODULE_0__=jquery'
      },

      jquerytools: {
        test: /jquery\.tools\.overlay(.js)?$/,
        loader: 'imports?jQuery=jquery,$=jquery!exports?$.tabs'
      },

      select2: {
        test: /select2\/select2(.min)?(.js)?$/,
        loader: 'imports?jQuery=jquery'
      },

      ploneformgen: {
        test: /pfgquickedit\/quickedit(.js)?$/,
        loader: 'imports?requirejs=>define,_tabs=resource-plone-app-jquerytools-js'
      },

      patternslib: {
        test: /patternslib\/src\/core\/utils(.js)?$/,
        loader: 'imports?_=underscore'
      }

    }
  };

  // Pre-configure plugins
  this.plugins = {

    plone: this,

    hrm: new webpack.HotModuleReplacementPlugin(),

    extract: new ExtractTextPlugin(
      '[name].[chunkhash].css', { allChunks: true }
    ),

    uglify: new webpack.optimize.UglifyJsPlugin({
      compress: { warnings: false }
    }),

    defineproduction: new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production')
    }),

    commonschunk: new webpack.optimize.CommonsChunkPlugin(
      'commons.' + (new Date()).getTime() + '.js'
    ),

    // Plone defaults to moment built with locales
    moment: new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),

    jqtree: new webpack.NormalModuleReplacementPlugin(
      /^\.\/jqtree-circle\.png$/, function(ob) {
         ob.request = '++plone++static/components/jqtree/jqtree-circle.png';
      }
    ),

    brokenrelativeresource: new webpack.NormalModuleReplacementPlugin(
      new RegExp('^\\.\\./[^+]*\\+\\+resource\\+\\+'), function(ob) {
         ob.request = ob.request.replace(/^[\.\/]+/, '');
      }
    ),

    // Fix dynamic requires in structure pattern
    // https://github.com/plone/mockup/commit/89de866dff89a455bd4102c84a3fa8f9a0bcc34b
    structurecontextreplacement: new webpack.ContextReplacementPlugin(
      /^\.$|mockup\/structure|mockup\/patterns\/structure/, function(ob) {
        if (ob.request && ob.request.match('^\.$') &&
            ob.context && ob.context.match('mockup\/structure')) {
          // resolve from Plone
          console.log("Error: Can properly resolve structure pattern only from a file system checkout. .");
        } else if (ob.resource &&
                   ob.resource.match(/mockup\/patterns\/structure/)) {
          // resolve from FS
          ob.regExp = /^\.\/.*$|^mockup-patterns-structure-url\/.*$/;
        }
      }
    ),
    structureaddtocontext: new AddToContextPlugin(
      /mockup\/structure|mockup\/patterns\/structure/, [
        'mockup-patterns-structure-url/js/actions',
        'mockup-patterns-structure-url/js/actionmenu',
        'mockup-patterns-structure-url/js/navigation',
        'mockup-patterns-structure-url/js/collections/result'
      ]
    ),

    // Write templates
    write: new WriteFileWebpackPlugin(),

    copy: new CopyWebpackPlugin(
      [{ from: path.join(sourcePath, '..'), to: '..' }], { ignore: ignore }),

    templates: templates.map(function(name) {
      return new HtmlWebpackPlugin({
        filename: name.substring(sourcePath.replace(/\/*$/, '/').length),
        template: name,
        chunksSortMode: function(a, b) {
          return a.names[0].match(/^commons/) ? -1
            : b.names[0].match(/^commons/) ? 1
            : a.names[0] > b.names[0] ? 1 : -1;
        },
        inject: false
      })
    })

  };

  this.alias = merge(config.paths, {
    'ace': 'brace'
  });

  this.development = {
    devtool: 'eval',
    resolve: {
      alias: this.alias
    },
    module: {
      loaders: [
        this.loaders.url,
        this.loaders.css,
        this.loaders.less,
        this.loaders.scss,
        this.loaders.shim.ace,
        this.loaders.shim.backbone,
        this.loaders.shim.bootstrapalert,
        this.loaders.shim.bootstrapcollapse,
        this.loaders.shim.bootstrapdropdown,
        this.loaders.shim.bootstraptooltip,
        this.loaders.shim.bootstraptransition,
        this.loaders.shim.jqtree,
        this.loaders.shim.jquerycookie,
        this.loaders.shim.jqueryeventdrag,
        this.loaders.shim.jqueryeventdrop,
        this.loaders.shim.jquerytmpl,
        this.loaders.shim.jquerytools,
        this.loaders.shim.mockuputils,
        this.loaders.shim.select2,
        this.loaders.shim.patternslib,
        this.loaders.shim.plone,
        this.loaders.shim.ploneformgen,
        this.loaders.shim.recurrenceinput,
        this.loaders.shim.tinymce,
        this.loaders.shim.tinymceplugins
      ]
    },
    devServer: {
      hot: true,
      inline: true,
      progress: true,
      stats: 'errors-only',
      host: 'localhost',
      port: '9000'
    },
    output: {
      pathinfo: true,
      filename: 'bundle.js',
      publicPath: publicPath
    },
    plugins: this.plugins.templates.concat([
      this.plugins.copy,
      this.plugins.hrm,
      this.plugins.moment,
      this.plugins.jqtree,
      this.plugins.brokenrelativeresource,
      this.plugins.structurecontextreplacement,
      this.plugins.structureaddtocontext,
      this.plugins.plone,
      this.plugins.write
    ])
  };

  this.production = {
    resolve: {
      alias: this.alias
    },
    module: {
      exprContextCritical: false,
      loaders: [
        this.loaders.url,
        this.loaders.extract.css,
        this.loaders.extract.less,
        this.loaders.extract.scss,
        this.loaders.shim.ace,
        this.loaders.shim.backbone,
        this.loaders.shim.bootstrapalert,
        this.loaders.shim.bootstrapcollapse,
        this.loaders.shim.bootstrapdropdown,
        this.loaders.shim.bootstraptooltip,
        this.loaders.shim.bootstraptransition,
        this.loaders.shim.jqtree,
        this.loaders.shim.jquerycookie,
        this.loaders.shim.jqueryeventdrag,
        this.loaders.shim.jqueryeventdrop,
        this.loaders.shim.jquerytmpl,
        this.loaders.shim.jquerytools,
        this.loaders.shim.mockuputils,
        this.loaders.shim.select2,
        this.loaders.shim.patternslib,
        this.loaders.shim.plone,
        this.loaders.shim.ploneformgen,
        this.loaders.shim.recurrenceinput,
        this.loaders.shim.tinymce,
        this.loaders.shim.tinymceplugins
      ]
    },
    output: {
      filename: '[name].[chunkhash].js',
      chunkFilename: '[chunkhash].js',
      publicPath: publicPath
    },
    plugins: this.plugins.templates.concat([
      this.plugins.commonschunk,
      this.plugins.copy,
      this.plugins.defineproduction,
      this.plugins.extract,
      this.plugins.moment,
      this.plugins.jqtree,
      this.plugins.brokenrelativeresource,
      this.plugins.structurecontextreplacement,
      this.plugins.structureaddtocontext,
      this.plugins.plone,
      this.plugins.uglify
    ])
  };
}

PloneWebpackPlugin.prototype.defaults = defaults;

// Webpack virtual file system path below the CWD
function ns(path) {
  path = path ? path : '';
  return (process.cwd() + '/@/' + path).replace(/\/+/g, '/');
}

PloneWebpackPlugin.prototype.apply = function(compiler) {
  const portalUrl = this.portalUrl;
  const portalPath = url.parse(this.portalUrl).pathname;
  const portalBase = portalUrl.substr(0, portalUrl.length - portalPath.length);
  const resolveExtensions = this.resolveExtensions;
  const resolveBlacklist = this.resolveBlacklist;
  const resolveMapping = this.resolveMapping;
  const debug = this.debug;

  // Resolve files (images, LESS files, etc) from Plone
  compiler.resolvers.normal.plugin('file', function(data, callback) {
    const this_ = this;
    const request = data.request.replace(/:\/+/, '://');

    var path_ = url.resolve(data.path + '/', request);
    var href;

    // Skip built-in modules and existing filesystem paths
    if (!data.request.length || fs.existsSync(request)) {
      callback();

    // Resolve files with full Plone path
    } else if (request.startsWith('./' + portalBase)) {
      href = portalBase + request.substring(
          2 + portalBase.length).replace(/\/+/g, '/');
      resolveResource(href, resolveExtensions, this_, callback, debug);

    // Resolve files with ++-starting path (most probably a Plone resources)
    } else if (request.startsWith('./++')) {
      href = portalUrl + '/' + request.substring(2);
      resolveResource(href, resolveExtensions, this_, callback, debug);

    // Resolve known missing files
    } else if (request !== 'LICENSE' && request.match(/^\.\/[^\/]+$/) &&
      fs.existsSync(path.join(__dirname, 'static', request))) {

      // - query.recurrenceinput.css, bundled with CMFPlone, references
      //   files next.gif, prev.gif and pb_close.png not bundled with CMFPlone

      this_.doResolve('result', {
        path: path.join(__dirname, 'static', request),
        query: data.query,
        file: true,
        resolved: true
      }, callback);

    // Resolve files with Plone context + relative path
    } else if (path_.startsWith(ns(portalPath)) ||
               path_.startsWith(ns('++'))) {
      if (resolveMapping[request] !== undefined) {
        href = url.resolve(portalUrl, url.resolve(
          data.path + '/', resolveMapping[request]
        ).substring(ns().length));
      } else {
        href = url.resolve(portalUrl, path_.substring(ns().length));
      }
      resolveResource(href, resolveExtensions, this_, callback, debug);

    // Fallback to the rest of Webpack resolver chain
    } else {
      callback();
    }
  });

  // Resolve JS modules from Plone
  compiler.resolvers.normal.plugin('module', function(data, callback) {
    const this_ = this;
    const href = portalUrl + '/' + data.request;

    // Skip known false positive Plone entry points
    if (resolveBlacklist.indexOf(data.request) > -1) {
      callback();

    // Resolve from Plone
    } else {
      resolveResource(href, resolveExtensions, this_, callback, debug);
    }
  });
};

module.exports = PloneWebpackPlugin;
