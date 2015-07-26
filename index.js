
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
  * [X] Rewrite filtering infrastructure so that a filter can "fork" filtering whenever
  * [X] Make event with "allDone", when _all_ filtering is done
  * [X] Fix issue: fileData must have a relative path without getSrc. fileData needs to be created
        in readdir so that filePath is relative. Then it's absolutised by filecopy.
  * [X] Standardise the way filePath/fileName/fileExt/fileNameAndExt are used

  * [X] Write lister to write paginating file with list of entries
  * [X] Make sane variables for paginating tags/categories
  * [X] Make pager variable with the list of pages pre-packaged, so that the pager "scrolls"
        keeping the current page in the middle unless at left or right edge

  * [X] Write plugin that will page single-page output safely.
  * [X] Change pager plugin so that it has pagerData the same as the lister
  * [X] Change logging so that it's not dead slow even though fileData is cloned and trimmed
  * [X] Write EJS filter, same as liquid but with real Javascript
  * [X] Face (and fix) issue where a filter will escape another filter's needed stuff

  * [X] Write "serve" command that will serve a file structore (easy! Just a web server!)
  * [/] Write "watch" command that will watch file system and re-filter files as needed
      [X] Make function to make list of all possible _info.yaml from a path
      [X] Make sure that all possible _info.yaml files are added as originFileURLs (in main)
      [X] Add layout files as originFileURLs (in ryver-layout)
      [X] Make watching cycle actually work, call eventEmitterCollect on each event (in main)
      [X] Monitor changes to _info.yaml files, update cache (in main)

      [ ] Make basic data structures to store what change will affect what file (in ryver-copy)
      [ ] Monitor that master entries in originFileURLs are not deleted (in ryver-copy)
      [ ] Write script that will re-filter files when an origin has changed (in ryver-copy)

      [ ] INITIAL MAIN TEST. CHANGES SHOULD NOW BE SUCCESSFULLY TRACKED

      [ ] Check for _config.yaml. If changed, rebuild _everything_ or simply quit

      [ ] Make ths work for ryver-lister (no originFileURLs) by creating initial data structure
          and then monitor changes and re-generating affected lists

  * [ ] Make default file structure for themes
  * [ ] Document everything properly on GitHub
  * [ ] Write test file that needs to be rendered properly, use result as test
  * [ ] At least make a simple basic web site using it


CHANGER:
Each module is responsible of re-filtering based on files touched.
Each module, at generation time, will need to create data to make watching possible

CHANGER: main
In the main ryver.js file.
* Metadata: Each file that is found during initial scan, is added to an hash
* What: Each time a file within the hash is changed, it will re-filter it

CHANGER: lister
* Metadata: A hash of files names associated to each category/tag
* What: Each time a file within the hash is changed, it will re-generate the
  list for that category. So if a file tagged as "unix" is changed, the list for
  "unix" is re-made

CHANGER: lister-latest
* Metadata: A hash of file names associated to what "latest" list they contain


*/
// Private module variables
// (Not exported)

var processing = {
  filters: {},
  src: null,
  dst: null,
  verbose: 0,
  toPostProcess: [],
  config: {},
  mainInfo: {},
  yamlCache: {},
};


// Public module variables
// (Exported)

var eventEC = exports.eventEC = new EventEmitterCollector;

// Signal management
eventEC.onCollect( 'watch', function( cb ){

  var f = function( op, URL, cb ){
    vlog( "main: Operation", op, "on", URL );

    // It will only care about _info.yaml
    if( p.basename( URL ) !== '_info.yaml' ) {
      vlog("main-info-watch: Ignoring file since it's not called _info.yaml");
      return cb( null );s
    }

    // Make up filePath and fileNameAndExt
    var filePath = p.dirname( URL);
    var fileNameAndExt = p.basename( URL );

    // If filePath is empty, dirname returns '.'. Change it to '.'
    if( filePath === '.' ) filePath = '';

    // Read the YAML file, which will also update the cache
    readYamlFile( {}, filePath, fileNameAndExt, function( err, newObject, yamlData ){
      log( "Cached of _info.yaml files changed to: ", processing.yamlCache[ URL ] );
      cb( null );
    });
  }

  // Return the function just defined as the filter
  cb( null, { name: 'main-info-watch', executor: f } );
});


// Private module methods

var addHooksToList = function( list, hookName, front ){

  var hooks = processing.filterHooks[ hookName ];

  log( "Adding hooks to filtersPipeline for hook", hookName );
  if( ! hooks.length ){
    log( 'No hooks registered for ', hookName );
    log( 'Adding dummy hook...' );
    list.push( { type: 'hook', name: 'dummy', hookName: hookName, func: function( o, cb ){ cb( null ); } });
    return;
  } else {
    log("Hooks registered for ", hookName,":", hooks.length );
  }

  hooks.forEach( function( hook ){
    if( front ){
      log( "Adding function to the top of the list" );
      list.unshift( { type: 'hook', name: hook.name, func: hook.executor, hookName: hookName } );
    }  else {
      log( "Adding function to the bottom of the list" );
      list.push( { type: 'hook', name: hook.name, func: hook.executor, hookName: hookName } );
    }
  });
}


var addFiltersToList = function( list, commaSeparatedFilters ){

  log( "Adding filters to filtersPipeline:", commaSeparatedFilters );

  // Make up the list as array, and give up if it was empty
  // Trim spaces, and filter out empty ones
  var l = commaSeparatedFilters.split(',').map( function( item ) {
    return item.replace(/ /g, '' );
  }).filter( function( item ){
    if( item === '' ) return false;
    return true;
  }).forEach( function( filterName ){
    list.push( { type: 'filter', name: filterName, func: processing.filters[ filterName ] } );
  });
}



// Make the array with the list of filters to be applied to the file
var makeFilterAndHookList = function( fileData, cb ){

  var list = [];

  // Make up defaults, empty if needed
  var preProcessFilters = fileData.info.preProcessFilters || '';
  var preFilters = fileData.info.preFilters || '';
  var filters = fileData.info.filters || '';
  var postFilters = fileData.info.postFilters || '';
  var postProcessFilters = fileData.info.postProcessFilters || '';

  // preProcessFilters and surrounding hooks
  //addHooksToList( list, 'beforePreProcessFilters' );
  vlog( "preProcessFilters..." ); addFiltersToList( list, preProcessFilters );
  vlog( "afterProcessFilters..." ); addHooksToList( list, 'afterPreProcessFilters' );

  // pre,-,post filters and surrounding hooks
  vlog( "beforeFilters..." ); addHooksToList( list, 'beforeFilters' );
  vlog( "preFilters..." ); addFiltersToList( list, preFilters );
  vlog( "filters..." ); addFiltersToList( list, filters );
  vlog( "postFilters..." ); addFiltersToList( list, postFilters );
  vlog( "afterFilters..." ); addHooksToList( list, 'afterFilters' );

  // When `fileData.info.delayPostProcess` is `true`, processing will stop here

  // postProcessFilters and surrounding hooks
  vlog( "beforePostProcessFilters..." ); addHooksToList( list, 'beforePostProcessFilters' );
  vlog( "postProcessFilters..." ); addFiltersToList( list, postProcessFilters );
  vlog( "afterPostProcessFilters..." ); addHooksToList( list, 'afterPostProcessFilters' );
  vlog( "afterEverything..." ); addHooksToList( list, 'afterEverything' );

  vlog("FINAL hook/filter list:" );
  vlog( list );
  return cb( null, list );
}


// Public module methods


// Getters and setters for 'processing' variables

var getConfig = exports.getConfig = function(){
  return processing.config;
}

var setConfig = exports.setConfig = function( config ){
  processing.config = config;
}

var getMainInfo = exports.getMainInfo = function(){
  return processing.mainInfo;
}

var setMainInfo = exports.setMainInfo = function( mainInfo ){
  processing.mainInfo = mainInfo;
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

var getYamlCache = exports.getYamlCache = function(){
  return processing.yamlCache;
}



var yamlURLsFromPath = exports.yamlURLsFromPath = function( filePath ){
  var l = filePath.split( p.sep );
  var r = [];
  var prec = '';

  if( l[ 0 ] != '' ) l.unshift( '' );

  // Make up the r array
  l.forEach( function( e ){
    prec = p.join( prec, e );
    r.push( p.join( prec, '_info.yaml' ) );
  });

  // Return it
  return r;
}


var callAllDone = exports.callAllDone = function( cb ){

  log();
  log("**************************************");
  log("**** ALL DONE HOOKS ******************");
  log("**************************************");
  log();

  async.eachSeries(

    processing.filterHooks.allDone,

    function( item, cb ){

      log( "Executing allDone function: ", item.name );
      item.executor.call( this, cb );
    },

    function( err ){
      if( err ) return cb( err );
      cb( null );
    }

  );
}

var isDir = exports.isDir = function( filePath, fileNameAndExt, cb ){

  fs.lstat( p.join( getSrc(), filePath, fileNameAndExt ), function( err, fileStat ){
    if( err ) return cb( err );

    // It's a directory: return true
    if( fileStat.isDirectory() ) return cb( null, true );

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
    if( typeof arguments[ 0 ] === 'function' && arguments.length == 1 ){
      arguments[0].call( this );
    } else {
      console.log.apply( this, arguments );
    }
  }

}

// Read file, but trying with a backup path if the "main" one isn't there.
var readFile = exports.readFile = function( filePath, backupFilePath, fileNameAndExt, cb ){

  var usedBackup = false;
  var fileContentsAsBuffer;

  // Load the contents of the landing file
  fs.readFile( p.join( getSrc(), filePath, fileNameAndExt ), function( err, c ){
    if( err && err.code !== 'ENOENT' ) return cb( err );

    if( err && err.code == 'ENOENT' ){

      // No backup: return the error as it was
      if( ! backupFilePath ) return cb( err );

      usedBackup = true;
      fs.readFile( p.join( getSrc(), backupFilePath, fileNameAndExt ), function( err, c ){
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

  var newFileData = cloneObject( fileData );

  newFileData.initialContents = '';

  if( newFileData.system.mimetype.split('/')[0] !== 'text'){
    newFileData.contents = "NON TEXT";
  }
  newFileData.system.fileContentsAsBuffer = '';

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
        'afterEverything',
        'allDone'
      ],
      function( item, cb ){
        eventEC.emitCollect( item, function( err, itemResult ){
        log( "Collecting hooks for ", item );
          if( err ) return cb( err );

          processing.filterHooks[ item ] = itemResult.onlyResults();
          log( "Function added to the hook:",  processing.filterHooks[ item ].length );
          vlog( "Functions added:",  processing.filterHooks[ item ] );

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


// Apply filters and hooks to fileData
// There are three things to remember and consider:
// 1) hooks in `beforePreProcessFilters` need to be able to change filters in
//    fileData.info. So, `beforePreProcessFilters` hooks are injected into the
//    filters/hooks pipeline,  _before_ the pipeline is properly created
// 2) If `system.stopFiltering` is set at any point, filtering will stop end of story
// 3) If `system.delayPostProcess` is set, processing will stop at
//    `beforePostProcessFilters` (unless `system.inDelayedPostProcess` is true)
var filter = exports.filter = function( fileData, cb){

  // If filtering was stopped, there is no point in doing _anything_
  if( fileData.system.stopFiltering ){
    log( "Filtering stopped because of stopFiltering" );
    return cb( null );
  }

  // If the pipeline is already there, simply go through it
  // This is used when this function is run in delayedPostProcess
  if( fileData.filtersPipeline ){
    goThroughPipeline();
  } else {

    // First of all, add the `beforePreProcessFilters` to the pipeline
    // and filter file with *that*
    fileData.filtersPipeline = [];
    addHooksToList( fileData.filtersPipeline, 'beforePreProcessFilters' );

    // At this point, the beforePreProcessFilters, which might change
    // the filter attributes in fileData, is set
    filter( fileData, function( err ){
      if( err === 'stopped' ) return cb( 'stopped' );
      if( err ) return cb( err );

      // At this point, it will add more entries to the pipeline (which
      // won't include beforePreProcessFlters) and will go through it
      makeFilterAndHookList( fileData, function( err, r ){
        if( err ) return cb( err );

        fileData.filtersPipeline = r;
        goThroughPipeline();
      });
    });
  }

  function goThroughPipeline(){

    log( "Putting file through filters and hooks now..." );
    vlog( fileData.filtersPipeline );

    async.whilst(

      function() { return fileData.filtersPipeline.length; },

      function( cb ) {

        // Convenience
        var list = fileData.filtersPipeline;

        // If the next element is the `beforePostProcessFilters` hook AND
        // system.delayPostProcess is true AND system.inDelayedPostProcess if false,
        // then it's time to quit -- even before getting the element out
        if( list[ 0 ].type == 'hook' && list[ 0 ].hookName == 'beforePostProcessFilters' ){
          if( fileData.system.delayPostProcess ){

            if( ! fileData.system.inDelayedPostProcess ){
              log("Postprocessing should be delayed, stopping here (for now)");

              // Adding extra hooks to the process pipeline
              addHooksToList( list, 'beforeDelayedPostProcess', true );
              addHooksToList( list, 'afterDelayedPostProcess' );

              // Adding file to the list of files that will need to be
              // processed later
              processing.toPostProcess.push( fileData );

              // This will ensure that the `delayPostProcess` flag won't work next time
              fileData.system.inDelayedPostProcess = true;

              log("Hook/filter list (will be executed later):" );
              log( list );

              return cb( 'delayed' );
            } else {
              log("Postprocessing was delayed and was resumed, continuing");
            }
          } else {
            log( "postProcessing wasn't delayed, about to start it.");
          }
        }

        var item = list.shift();

        if( item.name == 'dummy' )
          log ("Faking applying ", item.name, item.hookName );
        else
          log( "\n.........Applying " + item.type + ":", item.name );

        if( item.type === 'filter' ){

          // The filter must be defined
          if( ! item.func  ) return cb( new Error("Filter " + item.name + " invalid!") );

          // Check that the filter hasn't already been applied
          if( fileData.system.processedBy.indexOf( item.name ) != -1 ){
            log( "Filter was already applied:", item.name );
            return cb( null );
          }
        }

        item.func.call( this, fileData, function( err ){
          if( err ) return cb( err );

          if( item.name != 'dummy')
            vlog( function(){
              vlog( "fileData after " + item.type + " is:", trimFileData( fileData ) );
            } );

          // Add the filter to the `processedBy` list, which is a nice log and
          // it's used to avoid double-filtering
          if( item.type == 'filter' ) fileData.system.processedBy.push( item.name );

          // Check if the cycle should be interrupted
          if( fileData.system.stopFiltering ) return cb( 'stopped' );

          cb( null );
        });

      },
      function ( err ) {
        // If the cycle was stopped or delayed, simply
        if( err === 'stopped' || err === 'delayed') return cb( null );

        if( err ) return cb( err );

        cb( null );
      }
    );
  }
}


// Apply filter postProcess to items in processing.toPostProcess
// (their processing was halted at the hook `afterFilter` because
// `delayPostProcess` was set to `true`).
var filterDelayedItems = exports.filterDelayedItems = function( cb ){

  if( processing.toPostProcess.length !== 0 )
    log( "There are some files that had delayPostProcess set to true. Processing them now" );

  async.eachSeries(
    processing.toPostProcess,

    function( fileData, cb ){
      log( "\n\n-------------------\nPROCESSING ", fileData.system.fileName + fileData.system.fileExt,"\n-------------------\n" );
      filter( fileData, function( err ){
        if( err ) return cb( err );

        cb( null );
      });
    },

    function( err ){
      if( err == 'stopped' ) return cb( null );
      if( err ) return cb( err );

      return cb( null );
    }
  );
}

// Make a fileData object. If fileContentsAsBuffer isn't set, it will
// load it from filePath + fileName + fileExt
var makeFileData = exports.makeFileData = function( sourceURL, filePath, fileNameAndExt, fileContentsAsBuffer, info, cb ){

  if( fileContentsAsBuffer ){
    restOfFunction();
  } else {
    fs.readFile( p.join( getSrc(), filePath, fileNameAndExt ), function( err, fr ){
      if( err ) return cb( err );
      fileContentsAsBuffer = fr;
      restOfFunction();
    });
  }

  function restOfFunction(){

    magic.detect( fileContentsAsBuffer, function( err, magic ){
      if( err ) return cb( err );

      var fileExt = p.extname( fileNameAndExt );
      var fileName = p.basename( fileNameAndExt, fileExt );

      log("fileNameAndExt is", fileNameAndExt, "and as a result fileName is ", fileName, "and fileExt is:", fileExt );

      // Sets the basic file info
      var fileData = {
        system: {
          filePath: filePath,
          fileName: fileName,
          fileExt: fileExt,
          fileContentsAsBuffer: fileContentsAsBuffer,

          mimetype: magic,
          processedBy: [],
          originFileURLs: [],
          originMasterFileURL: sourceURL ?  sourceURL : null,
        },
        initialInfo: cloneObject( info ),
        info: cloneObject( info ),
        initialContents: fileContentsAsBuffer,
        contents: fileContentsAsBuffer.toString(),
      };

      // Add all of the info files to originFileURLs
      yamlURLsFromPath( fileData.system.filePath ).forEach( function( URL ){
        fileData.system.originFileURLs.push( URL );
      });

      cb( null, fileData );
    });
  }
}

// Read and parse config file
var readYamlFile = exports.readYamlFile = function( baseObject, filePath, fileNameAndExt, cb ){

  // Try and read the master _info.yaml file
  fs.readFile( p.join( getSrc(), filePath, fileNameAndExt), function( err, yamlFileAsBuffer ){
    if( err && err.code !== 'ENOENT' ) return cb( err );

    // If the file wasn't find, then simply treat it as an empty result and
    // return a copy of baseObject
    if( err && err.code === 'ENOENT' ){
      return cb( null, cloneObject( baseObject ) );
    }

    try {
      var yamlData = yaml.safeLoad( yamlFileAsBuffer, { filename:  p.join( filePath, fileNameAndExt ) } );
    } catch( err ) {
      return cb( err );
    }

    // Add the raw yaml file it to the yamCache structure
    if( fileNameAndExt === '_info.yaml' )
      processing.yamlCache[ p.join( filePath, fileNameAndExt) ] = yamlData;

    var newObject = cloneObject( baseObject );
    enrichObject( newObject, yamlData );

    cb( null, newObject, yamlData );
  });
}

// Read and parse config file. It simpy uses
var readAndSetConfig = exports.readAndSetConfig = function( cb ){

  if( ! getSrc() ){
    return cb( new Error("readAndSetConfig will only work after ryver.setSrc()"));
  }

  readYamlFile( {}, '', '_config.yaml', function( err, data ){
    if( err ) return cb( err );

    setConfig( data );
    return cb( null, data );
  });
}

// Main "build" function that will recursively go through
// absFilePath and filter each encountered file. It will also run
// `filterDelayedItems()` once all files have been filtered
var build = exports.build = function( absFilePath, passedInfo, cb ){

  // This function only works if process.src and process.dst are set
  if( getSrc() === null )
    return cb( new Error("You must set the source directory first with ryver.setSrc()"));
  if( getDst() === null )
    return cb( new Error("You must set the destination directory first with ryver.setDst()"));

  var mainCycle = false;

  // If the API signature `build( cb )` is used (no parameters),
  // then set the initial parameters.
  // Subsequent calls to this function will use the recursive signature
  // build( absFilePath, passedInfo )

  if( typeof absFilePath === 'function' ){
    cb = absFilePath;
    absFilePath = getSrc();
    passedInfo = {};
    mainCycle = true;
  }

  var info;
  var filePath = absFilePath.substr( getSrc().length + 1 );

  log( "absFilePath (full fs path):", absFilePath );
  log( "filePath (relative to getSrc():", filePath );

  // Read all of the files in that directory
  fs.readdir( absFilePath, function( err, fileNamesAndExt ){
    if( err ) return cb( err );

    log( "Will process the following files:", fileNamesAndExt );
    vlog( "Info (including inherited values) is:", passedInfo );

    // There is a _info.yaml in the local directory! It will load it, and
    // make an info object based on passedInfo enriched with localInfo
    if( fileNamesAndExt.indexOf( '_info.yaml' ) !== -1 ){

      log( "File _info.yaml found, reading it and enriching fileInfo with it");

      readYamlFile( passedInfo, filePath, '_info.yaml', function( err, loadedInfo ){
        if( err ) return cb( err );

        info = loadedInfo;
        if( mainCycle ) setMainInfo( loadedInfo );
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
        fileNamesAndExt,
        function( fileNameAndExt, cb ){

          log( "\n\n-------------------\nPROCESSING ", fileNameAndExt ,"\n-------------------\n" );
          if( fileNameAndExt[ 0 ] === '_' ){
            log( "File starts with underscore, ignoring altogether" );
            return cb( null );
          }

          // Break up fileName into fileName and fileExt
          //var fileExt = p.extname( fileNameAndExt );
          //var fileName = p.basename( fileNameAndExt, fileExt );

          isDir( filePath, fileNameAndExt, function( err, dir ){
            if( err ) return cb( err );

            // If it's a directory, process it as such
            if( dir ){
              log( "File is a directory. Entering it, and processing files in there" );
              return build( p.join( getSrc(), filePath, fileNameAndExt ), info, cb );
            }

            log( "It is a file. Reading its contents" );

            log( "filePath: ", filePath );
            log( "getSrc() is: ", getSrc() );

            makeFileData( p.join( filePath, fileNameAndExt ), filePath, fileNameAndExt, null, info, function( err, fileData ){
              if( err ) return cb( err );

              // Set the master (first entry) originFileURL
              fileData.system.originFileURLs.push( p.join( filePath, fileNameAndExt ) );

              log( "Basic fileData created" );
              vlog( function(){
                vlog( "Initial fileData before any filtering: ", trimFileData( fileData ) );
              });

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

          if( ! mainCycle ) return cb( null );

          log( "" );
          log( "*********************************************************************" );
          log( "******** THE END -- NOW FILTERING DELAYED ITEMS *********************" );
          log( "*********************************************************************" );
          log( "" );

          // At this point, we ought to process all the items that reused to get processed
          // and are now in processing.toPostProcess
          filterDelayedItems( function( err ){
            if( err ) return cb( err );

            callAllDone( function( err ){
              if( err ) return cb( err );

              cb( null );
            });

          })
        }
      ); // End of async cycle
    }
  })
}
