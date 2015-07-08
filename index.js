
var async = require('async');
var fs = require('fs.extra')
var p = require('path')
var EventEmitterCollector = require("eventemittercollector");
var mmm = require('mmmagic');
var DO = require('deepobject');
var yaml = require('js-yaml');
var chalk = require('chalk');

var Magic = mmm.Magic;
var magic = new Magic( mmm.MAGIC_MIME_TYPE );

/* TODO:
  * [X] Write function that goes through every file
  * [X] Allow plugin functions to process, sequentially, a file
  * [X] Write function that will process a file looking for special tags
  * [X] Implement some basic tags
  * [X] Add event when file is processed
  * [X] Add event when _all_ files are processed
  * [X] Use mmmagic to find out file type, add it to file data
  * [X] Switch to YAML for info
  * [X] Load front matter using YAML, same syntax as Jekyll
  * [X] Do not apply any filtering to files starting with _. Maybe completely ignore such files
  * [X] Make info.yaml invisible, and make it "inherit" the prevous directory's values
  * [X] Add way to prioritise plugins and filters
  * [X] Layout templates
      [X] Add filter to add header andfooter to file
      [X] Add filter that will apply a template and change file name and ext
      [X] Implement markdown, change extension and mime type to info
  * [X] Rationalise variable and attribute names, structure of info
  * [X] Add defaultPreFilters and defaultPostFilters to info
  * [X] Tidy up code as singleton object
  * [X] Change it so that there is only ONE parameter passed to each function
  * [X] Add pre-processing and post-processing, move frontMatter to pre-processing, making
        flters configurable per-file
  * [X] Write enrichObject function that recursively enrich an object, use it in both cases (clone, enrich)
  * [X] Check scope of info, make sure it's cloned in the right spots
  * [X] Turn it into a command-line tool and actually allow input/output dirs, respect them
  * [X] Create plugins file structure, include core ones, allow non-core ones
  * [X] Add command line/config to add non-core plugin
  * [X] Write fancy and nice logs when things happen, allow it to be verbose
  * [X] Add filter to copy files over to destination directory respecting name/ext
  * [X] Write plugin to add an "intro" page for every page (first injection)
  * [X] Give option to have landing page in a "main" folder so that other filters can use it.
  * [X] Move "landing" to its own module since it shouldn't be part of "copying"
  * [X] Provide the including file's INFO to the landing file before rendering
  * [X] Take src path out when copying file
  * [X] Delete tags Reintroduce "tags". Own filter with filter's API? Main module?
  * [X] Make `include` work with liquid o include another file, maybe rendered.
  * [X] Make function that reads config file and sets config, use it instead of "master" _info.yaml
  * [X] Add beforeDelayedPostProcess and afterDelayedPostProcess events, and use them in sorting
  * [X] Make sure sorting of tags happens a the right step

  * [X] Write lister to have list of 10 latest posts
  * [X] Change variable names from "group" to "list"
  * [X] Add before- and after- hooks, make frontmatter and lister use them to prevent pollution
  * [X] Check that plugins are in the right spot (config file) and are _overwritten_
  * [X] Check that I actually need to return fileInfo all the bloody time in filtering

  * [ ] Write lister to write paginating file with list of entries
  * [ ] Write plugin that will page single-page output safely. MAYBE find a way to re-start filtering
        with the next filter in the list?
  * [ ] Create liquid filters and tags

  * [ ] Write "serve" command that will serve a file structore
  * [ ] Write "observe" command that will observe file system and re-filter files as needed


  * [ ] Document everything properly on GitHub
  * [ ] Write test file that needs to be rendered properly, use result as test
  * [ ] At least make a simple basic web site using it

STAND BY:
  * [ ] Implement a liquid template to include a file and apply filtering, maybe extend `include`
        https://github.com/leizongmin/tinyliquid/issues/33
*/
// Private module variables


var processing = {
  filters: {},
  src: null,
  dst: null,
  verbose: 0,
  toPostProcess: [],
  config: {},
};


// Private module methods

/* none */

// Public module variables

/* none */

// Public module methods

var eventEC = exports.eventEC = new EventEmitterCollector;

// Getters and setters for 'processing' variables

var getConfig = exports.getConfig = function(){
  return processing.config;
}

var setConfig = exports.setConfig = function( config ){
  processing.config = config;
}

var setVerbose = exports.setVerbose = function( verbose ){
  processing.verbose = verbose;
}

var getSrc = exports.getSrc = function(){
  return processing.src;
}

var setSrc = exports.setSrc = function( src ){
  processing.src = src;
}

var getDst = exports.getDst = function(){
  return processing.dst;
}

var setDst = exports.setDst = function( dst ){
  processing.dst = dst;
}

var getFilters = exports.getFilters = function(){
  return processing.filters;
}

var isDir = exports.isDir = function( fullFilePath, cb ){

  fs.lstat( fullFilePath, function( err, fileStat ){
    if( err ) return cb( err );

    // It's a directory: return true
    if( fileStat.isDirectory() ) return cb( null, true );

    return cb( null, false );
  });
}

var isFile = exports.isFile = function( fullFilePath, cb ){

  fs.lstat( fullFilePath, function( err, fileStat ){
    if( err ) return cb( err );

    // It's a file: return true
    if( fileStat.isFile() ) return cb( null, true );

    return cb( null, false );
  });
}


// Normal logging: log with levels 1 and 2
var log = exports.log = function( ){
  if( processing.verbose == 1 || processing.verbose == 2 ){
    console.log.apply( this, arguments );
  }
}

// Very verbose logging: only log with level 2
var vlog = exports.vlog = function( ){
  if( processing.verbose == 2 ){
    console.log.apply( this, arguments );
  }
}


// Read file, but trying with a backup path if the "main" one isn't there.
var readFile = exports.readFile = function( path, backupPath, fileNameAndExt, cb ){

  var usedBackup = false;
  var fileContentsAsBuffer;

  // Load the contents of the landing file
  fs.readFile( p.join( path, fileNameAndExt ), function( err, c ){
    if( err && err.code !== 'ENOENT' ) return cb( null );

    if( err && err.code == 'ENOENT' ){
      usedBackup = true;
      fs.readFile( p.join( backupPath, fileNameAndExt ), function( err, c ){
        if( err ) return cb( err );

        fileContentsAsBuffer = c;
        usedBackup = true;
        restOfFunction();
      });

    } else {
      fileContentsAsBuffer = c;
      restOfFunction();
    }

    function restOfFunction(){
      // At this point, usedBackup and fileContentsAsBuffer
      // are all set and good

      cb( null, fileContentsAsBuffer, usedBackup );

    }
  });
}


var trimFileData = exports.trimFileData = function( fileData ){
  var newFileData = {};

  // Copy over everything except `initialContents`
  for( var k in fileData ){

    // Needs to be own property
    if( ! fileData.hasOwnProperty( k ) ) continue;

    // No initial contents copied over
    if( k === 'initialContents') continue;


    newFileData[ k ] = fileData[ k ];
  }

  // If it's not text, then chop `contents` away too
  if( fileData.system.mimetype.split('/')[0] !== 'text'){
    newFileData.contents = "NON TEXT";
  }

  return newFileData;
}


// http://stackoverflow.com/a/728694/829771
var cloneObject = exports.cloneObject = function( obj ) {

    // Handle the 3 simple types, and null or undefined
    if (null == obj || "object" != typeof obj) return obj;

    // Handle Date
    if (obj instanceof Date) {
        var copy = new Date();
        copy.setTime(obj.getTime());
        return copy;
    }

    // Handle Array
    if (obj instanceof Array) {
        var copy = [];
        for (var i = 0, len = obj.length; i < len; i++) {
            copy[i] = cloneObject(obj[i]);
        }
        return copy;
    }

    if (obj instanceof Object) {
    // Handle Object
        var copy = {};
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) copy[attr] = cloneObject(obj[attr]);
        }
        return copy;
    }

    throw new Error("Unable to copy obj! Its type isn't supported.");
}


// Enrich an object passing a list of extra paths
var enrichObject = exports.enrichObject = function( b, o ){
  var deepObj = new DO( b );
  for( var k in o ){
    deepObj.set( k, o[ k ] );
  }
}

// Set an object's value saving historical values in property + '_history'
var setSystemData = exports.setSystemData = function( system, key, value ) {
  system[ key + '_history' ] = system[ key + '_history' ] || [];
  system[ key + '_history' ].push( system[ key ] );
  system[ key ] = value;
}

// Pre-collect all filters and hooks and store them in processing.filterHooks
// and processing.filters, so that they are readily available when needed
// (without re-emitting etc.)
var collectFiltersAndHooks = exports.collectFiltersAndHooks = function( cb ){

  log( "Collecting filters")
  eventEC.emitCollect( 'filter', function( err, filters ){
    if( err ) return cb( err );

    filters.onlyResults().forEach( function( filter ) {
      log( "Filter found and made available:", filter.name );
      processing.filters[ filter.name ] = filter.executor;
    });

    log( "Collecting filter hooks")

    processing.filterHooks = {}
    async.eachSeries(
      [
        'beforePreProcessFilters',
        'afterPreProcessFilters',
        'beforeFilters',
        'afterFilters',
        'beforePostProcessFilters',
        'afterPostProcessFilters',
        'beforeDelayedPostProcess',
        'afterDelayedPostProcess',
      ],
      function( item, cb ){
        eventEC.emitCollect( item, function( err, itemResult ){
          if( err ) return cb( err );

          processing.filterHooks[ item ] = itemResult.onlyResults();
          cb( null );
        });
      },
      function( err ){
        if( err ) return cb( err );
        cb( null );
      }
    );
  });
}

// Apply _full_ filters and hooks to fileData
var filter = exports.filter = function( fileData, cb){

  var preProcessFilters = fileData.info.preProcessFilters || '';

  if( preProcessFilters != '' )
    log( "About to apply pre-process filters: ",preProcessFilters );
  else
    log( "No pre-process filters to apply" );

  applyFilterHooks( 'beforePreProcessFilters', fileData, function( err ){
    if( err ) return cb( err );

    applyFilterList( preProcessFilters, fileData, function( err ) {
      if( err ) return cb( err );

      applyFilterHooks( 'afterPreProcessFilters', fileData, function( err ){
        if( err ) return cb( err );

        if( preProcessFilters != '' )
          vlog( "After pre-process filters, contents are: ", trimFileData( fileData ) );

        var preFilters = fileData.info.preFilters || '';
        var filters = fileData.info.filters || '';
        var postFilters = fileData.info.postFilters || '';

        log( "About to apply pre-filters, filters and post-filters" );
        if( preFilters != '' ) log( "Pre-filters: ", preFilters );
        else log( "No pre-filters" );
        if( filters != '' ) log( "Filters: ", filters );
        else log( "No filters" );
        if( postFilters != '' ) log( "Post-filters: ", postFilters );
        else log( "No post-filters" );

        applyFilterHooks( 'beforeFilters', fileData, function( err ){
          if( err ) return cb( err );

          applyFilterList( [ preFilters, filters, postFilters ], fileData, function( err ) {
            if( err ) return cb( err );

            vlog( "After pre-filtering, filtering and post-filtering, contents are: ", trimFileData( fileData ) );

            applyFilterHooks( 'afterFilters', fileData, function( err ){
              if( err ) return cb( err );

              if( fileData.system.delayPostProcess ){
                log( "The element has been marked for delayed postProcess, not running postProcessFilter for now" );
                processing.toPostProcess.push( fileData );
                return cb( null, fileData );
              } else {
                log( "Running postProcessFilters immediately" );
                var postProcessFilters = fileData.info.postProcessFilters || '';

                applyFilterHooks( 'beforePostProcessFilters', fileData, function( err ){
                  if( err ) return cb( err );

                  applyFilterList( postProcessFilters, fileData, function( err ) {
                    if( err ) return cb( err );

                    applyFilterHooks( 'afterPostProcessFilters', fileData, function( err ){
                      if( err ) return cb( err );

                      return cb( null, fileData );
                    });
                  });
                });
              }
            });
          });
        });
      });
    });
  });
}


// Apply filter postProcess to items in processing.toPostProcess
// (their processing was halted at the hook `afterFilter` because
// `delayPostProcess` was set to `true`).
var filterDelayedItems = exports.filterDelayedItems = function( cb ){

  if( processing.toPostProcess.length !== 0 )
    log( "There are some files that had delayPostProcess set to true. Processing them now" );

  applyFilterHooks( 'beforeDelayedPostProcess', function( err ){
    if( err ) return cb( err );

    async.eachSeries(
      processing.toPostProcess,

      function( fileData, cb ){
        var postProcessFilters = fileData.info.postProcessFilters || '';
        log( "Processing ", fileData.system.fileName + fileData.system.fileExt );
        log( "Running postProcessFilters:", postProcessFilters );

        applyFilterHooks( 'beforePostProcessFilters', fileData, function( err ){
          if( err ) return cb( err );

          applyFilterList( postProcessFilters, fileData, function( err ) {
            if( err ) return cb( err );

            applyFilterHooks( 'afterPostProcessFilters', fileData, function( err ){
              if( err ) return cb( err );

              cb( null );
            });
          });
        });
      },

      function( err ){

        if( err ) return cb( err );

        applyFilterHooks( 'afterDelayedPostProcess', function( err ){
          if( err ) return cb( err );

          cb( null );
        });
      }
    );
  });
}


// Apply a list of filters. Here, fiterList is either an array of strings, or a
// string and EACH string is a comma-separated list of filters to apply
var applyFilterList = exports.applyFilterList = function( filterList, fileData, cb){

  var list = [];
  var functions = [];

  var fileContents = fileData.contents;

  // Starting point is always considered to be an array
  if( ! Array.isArray( filterList ) ) filterList = [ filterList ];

  // Here, 'list' is a comma-separated list
  filterList.forEach( function( f ) {

    // Make up the list as array, and give up if it was empty
    // Trim spaces, and filter out empty ones
    var l = f.split(',').map( function( item ) {
      return item.replace(/ /g, '' );
    }).filter( function( item ){
      if( item === '' ) return false;
      return true;
    });

    // Add the filters to the list
    list = list.concat( l );
  })

  list.forEach( function( filterName ){

    // Sanity checks: filter must exist, and must not repeat
    if( ! processing.filters[ filterName ] )
      return cb( new Error("Filter " + filterName + " invalid!") );

    // All good: add it, and mark it as already used
    functions.push( function( cb ){

      log( "Applying filter", filterName );

      // Check that the filter hasn't already been applied
      if( fileData.system.processedBy.indexOf( filterName ) != -1 ){
        log( "Filter was already applied:", filterName );
        return cb( null );
      }
      processing.filters[ filterName ].call( this, fileData, function( err ){
        if( err ) return cb( err );

        vlog( "fileData after filtering is:", trimFileData( fileData ) );
        fileData.system.processedBy.push( filterName );
        cb( null );
      });
    });
  });

  async.series( functions, function( err ){
    if( err ) return cb( err );

    cb( null );
  });
}

// Apply all hook functions associated to hook `hookName`
var applyFilterHooks = exports.applyFilterHooks = function( hookName, fileData, cb){

  log( "Applying filters given by hook: ", hookName );

  var hooks = processing.filterHooks[ hookName ];
  var functions = [];

  if( ! hooks.length ){
    log('No hooks registered for ', hookName );
    return cb( null );
  } else {
    log("Hooks registered for ", hookName,":", hooks.length );
  }

  hooks.forEach( function( hook ){

    // All good: add it, and mark it as already used
    functions.push( function( cb ){

      console.log( 'HOOK', hook );
      log( "Applying hook", hook.name );

      hook.executor.call( this, fileData, function( err ){
        if( err ) return cb( err );

        vlog( "fileData after hook is:", trimFileData( fileData ) );
        cb( null );
      });
    });

    async.series( functions, function( err ){
      if( err ) return cb( err );

      cb( null );
    });
  });
}


// Make a fileData object. If fileContentsAsBuffer isn't set, it will
// load it from filePath + fileName + fileExt
var makeFileData = exports.makeFileData = function( filePath, fileName, fileExt, fileContentsAsBuffer, info, cb ){

  var fullFilePath = p.join( filePath, fileName + fileExt );

  if( fileContentsAsBuffer ){
    restOfFunction();
  } else {
    fs.readFile( fullFilePath, function( err, fr ){
      if( err ) return cb( err );
      fileContentsAsBuffer = fr;
      restOfFunction();
    });
  }

  function restOfFunction(){

    magic.detect( fileContentsAsBuffer, function( err, magic ){
      if( err ) return cb( err );

      // Sets the basic file info
      var fileData = {
        system: {
          //fullFilePath: fullFilePath,
          filePath: filePath,
          fileName: fileName,
          fileExt: fileExt,
          fileContentsAsBuffer: fileContentsAsBuffer,

          mimetype: magic,
          processedBy: [],
        },
        initialInfo: cloneObject( info ),
        info: cloneObject( info ),
        initialContents: fileContentsAsBuffer,
        contents: fileContentsAsBuffer.toString(),
      };

      cb( null, fileData );
    });
  }
}

// Read and parse config file
var readConfig = exports.readConfig = function( dirPath, cb ){

  // Try and read the master _info.yaml file
  fs.readFile( p.join( dirPath, '_config.yaml'), function( err, configContents ){
    if( err ) return cb( err );

    try {
      config = yaml.safeLoad( configContents, { filename:  p.join( dirPath, '_config.yaml') } );
    } catch( e ) {
      return cb( err );
    }

    cb( null, config );
  });
}

// Main "build" function that will recursively go through
// dirPath and filter each encountered file. It will also run
// `filterDelayedItems()` once all files have been filtered
var build = exports.build = function( dirPath, passedInfo, cb ){

  // This function only works if process.src and process.dst are set
  if( getSrc() === null )
    return cb( new Error("You must set the source directory first with ryver.setSrc()"));
  if( getDst() === null )

    return cb( new Error("You must set the destination directory first with ryver.setDst()"));

  var mainCycle = false;

  // If the API signature `build( cb )` is used (no parameters),
  // then set the initial parameters.
  // Subsequent calls to this function will use the recursive signature
  // build( dirPath, passedInfo )

  if( typeof dirPath === 'function' ){
    cb = dirPath;
    dirPath = getSrc();
    passedInfo = {};
    mainCycle = true;
  }

  // Read all of the files in that directory
  fs.readdir( dirPath, function( err, fileNamesWithExt ){
    if( err ) return cb( err );

    log( "Will process the following files:", fileNamesWithExt );
    vlog( "Info (including inherited values) is:", passedInfo );

    // There is a _info.yaml in the local directory! It will load it, and
    // make an info object based on passedInfo enriched with localInfo
    if( fileNamesWithExt.indexOf( '_info.yaml' ) !== -1 ){

      log( "File _info.yaml found, reading it and enriching fileInfo with it");

      fs.readFile( p.join( dirPath, '_info.yaml' ), function( err, loadedInfo ){
        if( err ) return cb( err );
        try {
          var localInfo = yaml.safeLoad( loadedInfo, { filename: p.join( dirPath, 'info.yaml' ) } );
          info = cloneObject( passedInfo );
          enrichObject( info, localInfo );
          vlog( "Info after enriching with local _info.yaml is:", info );
        } catch ( e ){
          return cb( e );
        }
        restOfFunction();
      });
    } else {
      log( "File _info.yaml not found, will use unchanged, inherited values" );
      info = passedInfo;
      restOfFunction();
    }

    function restOfFunction(){

      log( "Going through all files in the directory" );
      async.eachSeries(
        fileNamesWithExt,
        function( fileName, cb ){

          log( "Processing ", fileName );
          if( fileName[ 0 ] === '_' ){
            log( "File starts with underscore, ignoring altogether" );
            return cb( null );
          }

          var fileExt = p.extname( fileName );
          fileName = p.basename( fileName, fileExt );

          var fullFilePath = p.join( dirPath, fileName + fileExt );
          isDir( fullFilePath, function( err, dir ){
            if( err ) return cb( err );

            // If it's a directory, process it as such
            if( dir ){
              log( "File is a directory. Entering it, and processing files in there" );
              return build( fullFilePath, info, cb );
            }

            log( "It is a file. Reading its contents" );

            makeFileData( dirPath, fileName, fileExt, null, info, function( err, fileData ){

              if( err ) return cb( err );

              log( "Basic fileData created" );
              vlog( "Initial fileData before any filtering: ", trimFileData( fileData ) );
              log( "The file's mime type is ", fileData.system.mimetype );

              filter( fileData, function( err ){
                if( err ) return cb( err );

                cb( null );
              })
            })
          })
        },

        function( err ){
          if( err ) return cb( err );

          console.log("mainCycle:", mainCycle );

          if( ! mainCycle ) return cb( null );

          log( "******** THE END*************************************************" );

          // At this point, we ought to process all the items that reused to get processed
          // and are now in processing.toPostProcess
          filterDelayedItems( function( err ){
            if( err ) return cb( err );

            cb( null );
          })
        }
      ); // End of async cycle
    }
  })
}
