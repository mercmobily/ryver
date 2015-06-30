
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

  TUESDAY:
  * [X] Write plugin to add an "intro" page for every page (first injection)

  WED:
  * [ ] Investigate "include" tag to include another file, maybe rendered
  * [ ] Investigate ability to generate multiple pages, decided by "tags", decide
        where to get the data from

  THE:
  * [ ] Write plugin to make tag lists, category list, maybe generic attribute
  * [ ] Write plugin that will page output safely, decide how to page tags

  FRI:
  * [ ] Re-enable specific tags that allow include/filtering

  SAT:
  * [ ] Document everything properly on GitHub

  SUN:
  * [ ] At least make a simple basic web site using it
*/

// Private module variables

var processing = {
  filters: {},
  src: null,
  dst: null,
  verbose: 0,
};

var getProcessingSrc = exports.getProcessingSrc = function(){
  return processing.src;
}

var getProcessingDst = exports.getProcessingDst = function(){
  return processing.dst;
}

// Private module methods

function isDir( fullFilePath, cb ){

  fs.lstat( fullFilePath, function( err, fileStat ){
    if( err ) return cb( err );

    // It's a directory: rerun the whole thing in that directory
    if( fileStat.isDirectory() ) return cb( null, true );

    return cb( null, false );
  });
}


// Public module variables
var eventEC = exports.eventEC = new EventEmitterCollector;

// Public module methods

var setVerbose = exports.setVerbose = function( verbose ){
  processing.verbose = verbose;
}

var log = exports.log = function( ){
  if( processing.verbose == 1 || processing.verbose == 2 ){
    console.log.apply( this, arguments );
  }
}

var vlog = exports.log = function( ){
  if( processing.verbose == 2 ){
    console.log.apply( this, arguments );
  }
}

var trimFileData = exports.trimFileData = function( fileData ){
  var newFileData = {};

  for( var k in fileData ){

    // Needs to be own property
    if( ! fileData.hasOwnProperty( k ) ) continue;

    // No initial contents copied over
    if( k === 'initialContents') continue;


    newFileData[ k ] = fileData[ k ];
  }

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


var enrichObject = exports.enrichObject = function( b, o ){
  var deepObj = new DO( b );
  for( var k in o ){
    deepObj.set( k, o[ k ] );
  }
}

var setSystemData = exports.setSystemData = function( system, key, value ) {
  system[ key + '_history' ] = system[ key + '_history' ] || [];
  system[ key + '_history' ].push( system[ key ] );
  system[ key ] = value;
}

/*
var changeFileExt = exports.changeFileExt = function( system, ext ){

  // Add extension to history
  system.fileExtHistory = system.fileExtHistory || [];
  system.fileExtHistory.push( system.fileExt );

  // Set new extension for both fileName and fileExt
  system.fileExt = ext.toLowerCase();
  system.fileName = system.fileName.substr( 0, system.fileName.lastIndexOf(".")) + "." + ext;
}
*/

var collectFilters = exports.collectFilters = function( cb ){

  log( "Collecting filters")
  eventEC.emitCollect( 'filter', function( err, filters ){
    if( err ) return cb( err );

    filters.onlyResults().forEach( function( filter ) {
      log( "Filter found and made available:", filter.name );
      processing.filters[ filter.name ] = filter.executor;
    });
    cb( null );
  });
}

var filter = exports.filter = function( fileData, cb){

  var preProcessFilters = fileData.info.preProcessFilters || '';

  if( preProcessFilters != '' )
    log( "About to apply pre-process filters: ",preProcessFilters );
  else
    log( "No pre-process filters to apply" );

  applyFilterList( preProcessFilters, fileData, function( err, fileData) {
    if( err ) return cb( err );

    if( preProcessFilters != '' )
      vlog( "After pre-process filters, contents are: ", trimFileData( fileData ) );

    var defaultPreFilters = fileData.info.defaultPreFilters || '';
    var filters = fileData.info.filters || '';
    var defaultPostFilters = fileData.info.defaultPostFilters || '';

    log( "About to apply pre-filters, filters and post-filters" );
    if( defaultPreFilters != '' ) log( "Pre-filters: ", defaultPreFilters );
    else log( "No pre-filters" );
    if( filters != '' ) log( "Filters: ", filters );
    else log( "No filters" );
    if( defaultPostFilters != '' ) log( "Post-filters: ", defaultPostFilters );
    else log( "No post-filters" );

    applyFilterList( [ defaultPreFilters, filters, defaultPostFilters ], fileData, function( err, fileData) {
      if( err ) return cb( err );

      vlog( "After pre-filtering, filtering and post-filtering, contents are: ", trimFileData( fileData ) );
      cb( null );
    });
  });
}

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
    functions.push( function( fileData, cb ){

      log( "Applying filter", filterName );

      // Check that the filter hasn't already been applied
      if( fileData.system.processedBy.indexOf( filterName ) != -1 ){

        vlog( "fileData after filtering is:", trimFileData( fileData ) );

        return cb( null, fileData );
      }
      processing.filters[ filterName ].call( this, fileData, cb );
      fileData.system.processedBy.push( filterName );
    });

  });
  var toExecute = [ function( cb ){
    return cb( null, fileData );

  } ].concat( functions );

  async.waterfall( toExecute, function( err, fileData){
    if( err ) return cb( err );

    cb( null, fileData );
  });
}

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

var build = exports.build = function( dirPath, dst, passedInfo, cb ){

  // There is one "passedInfo" per directory transfersed,
  // and several files to be filtered in each directory.

  var info;

  // The first time it's run, it will set the source and the destination
  processing.src = processing.src || dirPath;
  processing.dst = processing.dst || dst;

  fs.readdir( dirPath, function( err, fileNamesWithExt ){
    if( err ) return cb( err );

    log( "Will process the following files:", fileNamesWithExt );
    vlog( "Info (including inherited values) is:", passedInfo );

    // There is a _info.yaml in the local directory! It will load it, and
    // make an info object based on passedInfo enriched with localInfo
    if( fileNamesWithExt.indexOf( '_info.yaml' ) !== -1 ){

      log( "File _info.yaml found, reading it and enriching Info with it");

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
          console.log(fullFilePath);
          isDir( fullFilePath, function( err, dir ){
            if( err ) return cb( err );

            // If it's a directory, process it as such
            if( dir ){
              log( "File is a directory. Entering it, and processing files in there" );
              return build( fullFilePath, dst, info, cb );
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

          eventEC.emitCollect( 'afterFilter', function( err, afterFilters ){
            if( err ) return cb( err );

            async.applyEach( afterFilters.onlyResults(), function( err ){

              if( err ) return cb( null );

              cb( null );
            });
         });
        }
      ); // End of async cycle
    }
  })
}
