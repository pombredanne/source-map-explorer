const expect = require('chai').expect;
const fs = require('fs-extra');
const path = require('path');

const { execute } = require('./test-helpers');

const sourceMapExplorer = require('./index'),
  adjustSourcePaths = sourceMapExplorer.adjustSourcePaths,
  mapKeys = sourceMapExplorer.mapKeys,
  commonPathPrefix = sourceMapExplorer.commonPathPrefix,
  getBundles = sourceMapExplorer.getBundles;

const exploreBundlesAndWriteHtml = sourceMapExplorer.exploreBundlesAndWriteHtml;

const SCRIPT_PATH = './index.js';

describe('source-map-explorer', function() {
  describe('commonPathPrefix', function() {
    it('should find common prefixes', function() {
      expect(commonPathPrefix(['abc', 'abcd', 'ab'])).to.deep.equal(''); // no paths
      expect(commonPathPrefix(['/abc/def', '/bcd/efg'])).to.deep.equal('/'); // mismatch
      expect(commonPathPrefix(['/abc/def', '/abc/efg'])).to.deep.equal('/abc/');
      expect(commonPathPrefix([])).to.deep.equal('');
    });
  });

  describe('mapKeys', function() {
    it('should map keys', function() {
      expect(
        mapKeys({ a: 1, b: 2 }, function(x) {
          return x;
        })
      ).to.deep.equal({ a: 1, b: 2 });
      expect(
        mapKeys({ a: 1, b: 2 }, function(x) {
          return x + x;
        })
      ).to.deep.equal({ aa: 1, bb: 2 });
      expect(
        mapKeys({}, function(x) {
          return x + x;
        })
      ).to.deep.equal({});
    });
  });

  describe('adjustSourcePaths', function() {
    it('should factor out a common prefix', function() {
      expect(
        adjustSourcePaths({ '/src/foo.js': 10, '/src/bar.js': 20 }, true, [], [])
      ).to.deep.equal({ 'foo.js': 10, 'bar.js': 20 });
      expect(
        adjustSourcePaths({ '/src/foo.js': 10, '/src/foodle.js': 20 }, true, [], [])
      ).to.deep.equal({ 'foo.js': 10, 'foodle.js': 20 });
    });

    it('should find/replace', function() {
      expect(
        adjustSourcePaths({ '/src/foo.js': 10, '/src/foodle.js': 20 }, false, {
          src: 'dist',
        })
      ).to.deep.equal({ '/dist/foo.js': 10, '/dist/foodle.js': 20 });
    });

    it('should find/replace with regexp', function() {
      expect(
        adjustSourcePaths({ '/src/foo.js': 10, '/src/foodle.js': 20 }, false, {
          'foo.': 'bar.',
        })
      ).to.deep.equal({ '/src/bar.js': 10, '/src/bar.le.js': 20 });
    });

    it('should find/replace with regexp, can be used to add root', function() {
      expect(
        adjustSourcePaths({ '/foo/foo.js': 10, '/foo/foodle.js': 20 }, false, {
          '^/foo': '/bar',
        })
      ).to.deep.equal({ '/bar/foo.js': 10, '/bar/foodle.js': 20 });
    });
  });

  describe('command line parsing', function() {
    it('should expand glob', () => {
      expect(getBundles('testdata/foo.min.js*')).to.deep.equal([
        {
          codePath: 'testdata/foo.min.js',
          mapPath: 'testdata/foo.min.js.map',
        },
      ]);
    });

    it('should return one bundle if map file specified', function() {
      expect(getBundles('foo.min.js', 'foo.min.js.map')).to.deep.equal([
        {
          codePath: 'foo.min.js',
          mapPath: 'foo.min.js.map',
        },
      ]);
    });

    it('should expand glob into all bundles in directory', function() {
      expect(getBundles('testdata/*.*'), 'multiple bundles').to.deep.equal([
        {
          codePath: 'testdata/foo.1234.js',
          mapPath: 'testdata/foo.1234.js.map',
        },
        {
          codePath: 'testdata/foo.min.inline-map.js',
          mapPath: undefined,
        },
        {
          codePath: 'testdata/foo.min.js',
          mapPath: 'testdata/foo.min.js.map',
        },
        {
          codePath: 'testdata/foo.min.no-map.js',
          mapPath: undefined,
        },
      ]);
    });

    it('should support single file glob', () => {
      expect(getBundles('testdata/foo.1*.js')).to.deep.equal([
        {
          codePath: 'testdata/foo.1234.js',
          mapPath: 'testdata/foo.1234.js.map',
        },
      ]);
    });

    it('should support single file glob when inline map', () => {
      expect(getBundles('testdata/foo.min.inline*.js'), 'single glob').to.deep.equal([
        {
          codePath: 'testdata/foo.min.inline-map.js',
          mapPath: undefined,
        },
      ]);
    });
  });

  describe('Public API', function() {
    var fooDataInline = {
      files: {
        '<unmapped>': 0,
        'dist/bar.js': 2854,
        'dist/foo.js': 137,
        'node_modules/browserify/node_modules/browser-pack/_prelude.js': 463,
      },
      unmappedBytes: 0,
      totalBytes: 3454,
    };

    var fooDataFile = {
      files: {
        '<unmapped>': 0,
        'dist/bar.js': 97,
        'dist/foo.js': 137,
        'node_modules/browserify/node_modules/browser-pack/_prelude.js': 463,
      },
      unmappedBytes: 0,
      totalBytes: 697,
    };

    it('should generate data when provided with js file with inline map', function() {
      expect(sourceMapExplorer('testdata/foo.min.inline-map.js')).to.deep.equal(fooDataInline);
    });

    it('should generate data when provided with file with referenced map', function() {
      expect(sourceMapExplorer('testdata/foo.min.js')).to.deep.equal(fooDataFile);
    });

    it('should generate data when provided with file with separated map file', function() {
      var fooDataSeparated = {
        files: {
          '<unmapped>': 0,
          'dist/bar.js': 62,
          'dist/foo.js': 137,
          'node_modules/browserify/node_modules/browser-pack/_prelude.js': 463,
        },
        unmappedBytes: 0,
        totalBytes: 662,
      };

      expect(
        sourceMapExplorer('testdata/foo.min.no-map.js', 'testdata/foo.min.no-map.separated.js.map')
      ).to.deep.equal(fooDataSeparated);
    });

    it('should generate data respecting onlyMapped and replace options', function() {
      var fooDataReplacedNoUnmapped = {
        files: {
          'hello/bar.js': 97,
          'hello/foo.js': 137,
          'node_modules/browserify/node_modules/browser-pack/_prelude.js': 463,
        },
        unmappedBytes: 0,
        totalBytes: 697,
      };

      expect(
        sourceMapExplorer('testdata/foo.min.js', 'testdata/foo.min.js.map', {
          onlyMapped: true,
          replace: { dist: 'hello' },
        })
      ).to.deep.equal(fooDataReplacedNoUnmapped);
    });

    it('should accept options passed as second or third argument', function() {
      var fooDataNoUnmapped = {
        files: {
          'dist/bar.js': 97,
          'dist/foo.js': 137,
          'node_modules/browserify/node_modules/browser-pack/_prelude.js': 463,
        },
        unmappedBytes: 0,
        totalBytes: 697,
      };

      expect(
        sourceMapExplorer('testdata/foo.min.js', 'testdata/foo.min.js.map', {
          onlyMapped: true,
        })
      ).to.deep.equal(fooDataNoUnmapped);

      expect(sourceMapExplorer('testdata/foo.min.js', { onlyMapped: true })).to.deep.equal(
        fooDataNoUnmapped
      );
    });

    it('should accept buffer with inline map', function() {
      expect(sourceMapExplorer(fs.readFileSync('testdata/foo.min.inline-map.js'))).to.deep.equal(
        fooDataInline
      );
    });

    it('should accept buffers with js and map', function() {
      expect(
        sourceMapExplorer(
          fs.readFileSync('testdata/foo.min.js'),
          fs.readFileSync('testdata/foo.min.js.map')
        )
      ).to.deep.equal(fooDataFile);
    });

    it('should generate html', function() {
      expect(
        sourceMapExplorer(fs.readFileSync('testdata/foo.min.inline-map.js'), {
          html: true,
        })
      )
        .to.have.property('html')
        .that.contains('<title>Buffer - Source Map Explorer</title>')
        .and.contains('"bar.js')
        .and.contains('"foo.js');

      expect(sourceMapExplorer('testdata/foo.min.js', { html: true }))
        .to.have.property('html')
        .that.contains('<title>testdata/foo.min.js - Source Map Explorer</title>')
        .and.contains('"bar.js')
        .and.contains('"foo.js');
    });

    it('should throw when specified file (js or map) not found', function() {
      expect(function() {
        sourceMapExplorer('testdata/something.js');
      }).to.throw('no such file or directory');

      expect(function() {
        sourceMapExplorer('testdata/foo.min.js', 'testdata/foo.min.js.maap');
      }).to.throw('no such file or directory');
    });

    it('should trow when cannot locate sourcemap', function() {
      expect(function() {
        sourceMapExplorer('testdata/foo.min.no-map.js');
      }).to.throw('Unable to find a source map.');
    });

    it('should throw when used with bad sourcemap', function() {
      expect(function() {
        sourceMapExplorer('testdata/foo.min.no-map.js', 'testdata/foo.min.no-map.bad-map.js.map');
      }).to.throw('Your source map only contains one source (foo.min.js)');
    });

    describe('exploreBundlesAndWriteHtml method', function() {
      function writeConfigToPath(writeConfig) {
        return writeConfig.path !== undefined
          ? `${writeConfig.path}/${writeConfig.fileName}`
          : writeConfig.fileName;
      }

      function expectBundleHtml(data) {
        expect(data).to.to.be.a('string');
        expect(data).to.have.string('<title>[combined] - Source Map Explorer</title>');
      }

      it('should explore multiple bundles and write a html file as specified in writeConfig', async () => {
        const writePath = path.resolve(__dirname, 'tmp');
        const writeConfig = {
          path: writePath,
          fileName: 'bundle-out.tmp.html',
        };

        await exploreBundlesAndWriteHtml(writeConfig, 'testdata/*.*');

        const data = fs.readFileSync(writeConfigToPath(writeConfig), 'utf8');

        expectBundleHtml(data);

        fs.removeSync(writePath);
      });

      it('should explore multiple bundles and write a html file to current directory if path is undefined in writeConfig', async function() {
        const writeConfig = { fileName: 'bundle-out.tmp.html' };

        await exploreBundlesAndWriteHtml(writeConfig, 'testdata/*.*');

        const data = fs.readFileSync(writeConfigToPath(writeConfig), 'utf8');

        expectBundleHtml(data);

        fs.removeSync(writeConfig.fileName);
      });
    });
  });

  describe('CLI', () => {
    it('should validate --replace arguments', async function() {
      try {
        await execute(SCRIPT_PATH, [
          'testdata/foo.min.inline-map.js',
          '--replace=foo',
          '--with=bar',
          '--replace=we',
        ]);
      } catch (err) {
        expect(err).to.include('--replace flags must be paired with --with flags.');
      }
    });

    it('should print result as JSON', async function() {
      const result = await execute(SCRIPT_PATH, ['testdata/foo.min.inline-map.js', '--json']);

      expect(result).to.be.equal(`{
  "node_modules/browserify/node_modules/browser-pack/_prelude.js": 463,
  "dist/bar.js": 2854,
  "dist/foo.js": 137,
  "<unmapped>": 0
}
`);
    });

    it('should output result as tsv', async function() {
      const result = await execute(SCRIPT_PATH, ['testdata/foo.min.inline-map.js', '--tsv']);

      expect(result).to.be.equal(`Source\tSize
463\tnode_modules/browserify/node_modules/browser-pack/_prelude.js
2854\tdist/bar.js
137\tdist/foo.js
0\t<unmapped>
`);
    });

    it('should output result as html', async function() {
      const result = await execute(SCRIPT_PATH, ['testdata/foo.min.inline-map.js', '--html']);

      expect(result).to.be.include(
        '<title>testdata/foo.min.inline-map.js - Source Map Explorer</title>'
      );
    });
  });
});
