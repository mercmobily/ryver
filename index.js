
var async = require('async');
var fs = require('fs-extra')
var p = require('path')
var EventEmitterCollector = require("eventemittercollector");
var mmm = require('mmmagic');
var DO = require('deepobject');
var yaml = require('js-yaml');
var chalk = require('chalk');

var Magic = mmm.Magic;
var magic = new Magic( mmm.MAGIC_MIME_TYPE );

/* TODO:
  * [ ] Change ryver-lister so that it returns proper extra things to filter rather than "the lot"
  * [ ] MAYBE do filter_include: https://github.com/leizongmin/tinyliquid/issues/33#issuecomment-118792483
  * [ ] Make default file structure for themes
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
  watch: false,
};

// Public module variables
// (Exported)

var eventEC = exports.eventEC = new EventEmitterCollector;

// Signal management
eventEC.onCollect( 'watch', function( cb ){

  var f = function( op, URL, cb ){
    vlog( "main: Operation", op, "on", URL );

    // If _config.yaml is changed, it's game over
    if( URL === "_config.yaml" ){
      console.log("Config file changed, exiting execution..." );
      process.exit( 0 );
    }

    // It will only care about _info.yaml
    if( p.basename( URL ) !== '_info.yaml' ) {
      vlog("main-info-watch: Ignoring file since it's not called _info.yaml");
      return cb( null );
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

var deleteTrailingSlash = function( src ){
  var lastIndex = src.length -1;
  if( src[ lastIndex ] == '/' )
    return src.substr(0, lastIndex )
  else
    return src;
}

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

  config.ignoreHash = {};
  config.copyHash = {};
  config.asFile = {};
  config.linkAsFileHash = {};
  config.linkAsDirectoryHash = {};

  if( Array.isArray( config.ignore ) ){
    config.ignore.forEach( function( ignore ){
      config.ignoreHash[ deleteTrailingSlash( ignore ) ] = true;
    });
  }

  if( Array.isArray( config.copy ) ){
    config.copy.forEach( function( copy ){
      config.copyHash[ deleteTrailingSlash( copy ) ] = true;
    });
  }

  if( Array.isArray( config.linkAsFile ) ){
    config.linkAsFile.forEach( function( linkAsFile ){
      config.linkAsFileHash[ deleteTrailingSlash( linkAsFile ) ] = true;
    });
  }

  if( Array.isArray( config.linkAsDirectory ) ){
    config.linkAsDirectory.forEach( function( linkAsDirectory ){
      config.linkAsDirectoryHash[ deleteTrailingSlash( linkAsDirectory ) ] = true;
    });
  }

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
  processing.src = deleteTrailingSlash( src );
}

var getDst = exports.getDst = function(){
  return processing.dst;
}

var setDst = exports.setDst = function( dst ){
  processing.dst = deleteTrailingSlash( dst );
}

var getFilters = exports.getFilters = function(){
  return processing.filters;
}

var getYamlCache = exports.getYamlCache = function(){
  return processing.yamlCache;
}

var getWatch = exports.getWatch = function(){
  return processing.watch;
}

var setWatch = exports.setWatch = function( watch ){
  processing.watch = watch;
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


var yamlFromFileURL = exports.yamlFromFileURL = function( originFileURL ){

  var yamlFiles = yamlURLsFromPath( p.dirname( originFileURL ) );
  var yamlCache = processing.yamlCache;

  log("Processing origin file: ", originFileURL );

  var finalYaml = {};
  yamlFiles.forEach( function( yamlFile ){
    if( yamlCache[ yamlFile ] ) enrichObject( finalYaml, yamlCache[ yamlFile ] );
  });

  vlog("Final YAML file to be applied:", finalYaml );

  return finalYaml;

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

var getFileType = exports.getFileType = function( filePath, fileNameAndExt, cb ){

  var fullFilePath = p.join( getSrc(), filePath, fileNameAndExt );
  fs.lstat( fullFilePath, function( err, fileStat ){
    if( err ) return cb( err );

    // Ryver is only interested in files, directories and symlinks. Anything else
    // won't be dealt with (as it shouldn't)
    var fileType;
    if( fileStat.isFile() ) fileType= 'file';
    else if( fileStat.isDirectory() ) fileType = 'directory';
    else if( fileStat.isSymbolicLink() ) fileType = 'symlink';
    else fileType = 'other';

    // If it's not a symlink, we are totally done
    if( fileType != 'symlink' ){
      return cb( null, fileType, fileStat );
    }

    // If it IS a symlink, it will enrich fileStat with the location where the link points to
    fs.readlink( fullFilePath, function( err, pointsTo ){
      if( err ) return cb( err );

      fileStat.pointsTo = pointsTo;
      return cb( null, fileType, fileStat );
    })
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


// Enrich an object using DeepObject
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
        // ...front matter...
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

      // Zap toPostProcess now that everything has been post-processed
      processing.toPostProcess = [];

      return cb( null );
    }
  );
}

// Make a fileData object. If fileContentsAsBuffer isn't set, it will
// load it from filePath + fileName + fileExt
var makeFileData = exports.makeFileData = function( sourceURL, filePath, fileNameAndExt, fileContentsAsBuffer, info, skipCloning, cb ){

  if( fileContentsAsBuffer ){
    restOfFunction();
  } else {
    // TODO: Check if it's a symlink
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

      //console.log("\n\n\nINFO IS: ", require('util').inspect(info, {showHidden: false, depth: null}));
      // Sets the basic file info
      var fileData = {
        system: {
          filePath: filePath,
          fileName: fileName,
          fileExt: fileExt,
          fileContentsAsBuffer: fileContentsAsBuffer,

          mimetype: magic,
          processedBy: [],
          originDependencies: [],
          originMasterFileURL: sourceURL ?  sourceURL : null,
        },
        initialInfo: skipCloning ? info : cloneObject( info ),
        info: skipCloning ? info : cloneObject( info ),
        initialContents: fileContentsAsBuffer,
        contents: fileContentsAsBuffer,
      };

      // Convert to string if it's text-based mime type
      // This will leave binary data (images, etc.) intact
      if( fileData.system.mimetype.split('/')[0] === 'text')
        fileData.contents = fileData.contents.toString('utf-8');

      // Add all of the info files to originDependencies
      yamlURLsFromPath( fileData.system.filePath ).forEach( function( URL ){
        fileData.system.originDependencies.push( URL );
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

// Read and parse config file. It simply uses
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


  // Check if it needs to be ignored or copied (check if config file says so)
  // #DOCUMENT
  if( processing.config.ignoreHash[ filePath ] ){
    log( "File is to be ignored, ignoring" );
    return cb( null );
  }

  // Check if it needs to be ignored or copied (check if config file says so)
  // #DOCUMENT
  if( processing.config.copyHash[ filePath ] ){
    log( "File is to be copied straight through. Doing it" );

    fs.mkdirp( p.join( getDst(), filePath), function( err ){
      if( err ) return cb( null );

      fs.copy(  p.join( absFilePath ), p.join( getDst(), filePath  ), { clobber: true, preserveTimestamps: true }, function( err ){
        if( err ) return cb( err );
        return cb( null );
      });
    });

  } else {

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


            getFileType( filePath, fileNameAndExt, function( err, fileType, statInfo ){
              if( err ) return cb( err );

              if( fileType == 'symlink' ){

                log( "Checking", p.join( filePath, fileNameAndExt), 'against', processing.config.linkAsDirectoryHash, processing.config.linkAsFileHash );

                if( processing.config.linkAsDirectoryHash[ p.join( filePath, fileNameAndExt)] ){
                  log("File is symlink, but it will be treated as a directory as requested by config file");
                  fileType = 'directory';
                }

                if( processing.config.linkAsFileHash[ p.join( filePath, fileNameAndExt)] ){
                  log("File is symlink, but it will be treated as a file as requested by config file");
                  fileType = 'file';
                }

              }

              // If it's a directory, process it as such
              if( fileType == 'directory' ){
                log( "File is a directory. Entering it, and processing files in there" );
                return build( p.join( getSrc(), filePath, fileNameAndExt ), info, cb );
              }

              // If it's a directory, process it as such
              else if( fileType == 'symlink' ){
                log( "File is a symlink. Copying it straight" );

                // Delete link first. Unlike files, links are not just overwritten
                fs.unlink( p.join( getDst(), filePath, fileNameAndExt  ), function( err ){
                  if( err && err.code != 'ENOENT' ) return cb( err ); // ENOENT is allowed, it's just an attempt

                    fs.mkdirp( p.join( getDst(), filePath ), function( err ){
                      if( err ) return cb( err );

                      fs.symlink(  statInfo.pointsTo, p.join( getDst(), filePath, fileNameAndExt  ),function( err ){

                      //if( err ) return cb( err );
                      if( err ) console.log("ERR DURING symlink:", err );
                      // Errors need to be quiet because the target might not yet exist
                      // TODO: Fix this, make it so that symlinks to be made are added to an array and created
                      // at the end


                      return cb( null );
                    });
                  });
                });
              }

              else if( fileType == 'other' ){
                log( "File is not a directory, a normal file or a symbolic link. Aborting." );
                return cb( new Error( "Error processing", fileNameAndExt," in ", absFilePath, " -- file needs to be a normal file, a directory or a symlink"));
              }

              else {

                log( "It is a file. Reading its contents" );

                log( "filePath: ", filePath );
                log( "getSrc() is: ", getSrc() );

                makeFileData( p.join( filePath, fileNameAndExt ), filePath, fileNameAndExt, null, info, false, function( err, fileData ){
                  if( err ) return cb( err );

                  // Add the file itself to the list of origins since it IS a file on the file system
                  //fileData.system.originDependencies.push( p.join( filePath, fileNameAndExt ) );

                  log( "Basic fileData created" );
                  vlog( function(){
                    vlog( "Initial fileData before any filtering: ", trimFileData( fileData ) );
                  });

                  log( "The file's mime type is ", fileData.system.mimetype );

                  filter( fileData, function( err ){
                    if( err ) return cb( err );

                    vlog( function(){
                      vlog( "fileData after filtering: ", trimFileData( fileData ) );
                    });


                    cb( null );
                  })
                })
              }
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
}
