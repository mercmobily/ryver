
var async = require('async');
var fs = require('fs')
var p = require('path')
var EventEmitterCollector = require("eventemittercollector");
var mmm = require('mmmagic');
var DO = require('deepobject');
var yaml = require('js-yaml');

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

  TODAY:
  * [X] Add defaultPreFilters and defaultPostFilters to info
  * [X] Tidy up code as singleton object
  * [X] Change it so that there is only ONE parameter passed to each function
  * [X] Add pre-processing and post-processing, move frontMatter to pre-processing, making
        flters configurable per-file
  * [X] Write enrichObject function that recursively enrich an object, use it in both cases (clone, enrich)
  * [X] Check scope of info, make sure it's cloned in the right spots

  TOMORROW:
  * [X] Turn it into a command-line tool and actually allow input/output dirs, respect them
  * [ ] Create plugins file structure, include core ones, allow non-core ones
  * [ ] Write fancy and nice logs when things happen, allow it to be verbose

  MONDAY:
  * [ ] Add afterFilter hook to copy files over respecting new info
  * [ ] Publish to GitHub with basic documentation

  TUESDAY:
  * [ ] Write plugin to make tag lists, category list, maybe generic attribute

  WEDNESDAY:
  * [ ] Write plugin that will page output safely, decide how to page tags


*/

// Private module variables

var processing = {
  filters: {},
  src: null,
  dst: null,
};

// Private module methods

var filter = exports.filter = function( filterList, fileData, cb){

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

      // Check that the filter hasn't already been applied
      if( fileData.system.processedBy.indexOf( filterName ) != -1 ){

        //console.log("FILTER " + filterName + " ALREADY APPLIED!");
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

// Public module variables
var eventEC = exports.eventEC = new EventEmitterCollector;

// Public module methods

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

var changeFileExt = exports.changeFileExt = function( system, ext ){

  // Add extension to history
  system.fileExtHistory = system.fileExtHistory || [];
  system.fileExtHistory.push( system.fileExt );

  // Set new extension for both fileName and fileExt
  system.fileExt = ext.toLowerCase();
  system.fileName = system.fileName.substr( 0, system.fileName.lastIndexOf(".")) + "." + ext;
}

var collectFilters = exports.collectFilters = function( cb ){

  eventEC.emitCollect( 'filter', function( err, filters ){
    if( err ) return cb( err );

    filters.onlyResults().forEach( function( filter ) {
      processing.filters[ filter.name ] = filter.executor;
    });
    cb( null );
  });
}


var build = exports.build = function( filePath, dst, passedInfo, cb ){

  // There is one "passedInfo" per directory transfersed,
  // and several files to be filtered in each directory.

  var info;

  // The first time it's run, it will set the source and the destination
  processing.src = processing.src || filePath;
  processing.dst = processing.dst || filePath;

  fs.readdir( filePath, function( err, fileNames ){
    if( err ) return cb( err );

    console.log( "FILES:", fileNames );

    // There is a _info.yaml in the local directory! It will load it, and
    // make an info object based on passedInfo enriched with localInfo
    if( fileNames.indexOf( '_info.yaml' ) !== -1 ){

      fs.readFile( p.join( filePath, '_info.yaml' ), function( err, loadedInfo ){
        if( err ) return cb( err );
        try {
          var localInfo = yaml.safeLoad( loadedInfo, { filename: p.join( filePath, 'info.yaml' ) } );
          info = cloneObject( passedInfo );
          enrichObject( info, localInfo );
        } catch ( e ){
          return cb( e );
        }
        restOfFunction();
      });
    } else {
      info = passedInfo;
      restOfFunction();
    }

    function restOfFunction(){

      async.eachSeries(
        fileNames,
        function( fileName, cb ){

          if( fileName[ 0 ] === '_' ) return cb( null );

          var fileNameWithPath = p.join( filePath, fileName );

          fs.lstat( fileNameWithPath, function( err, fileStat ){
            if( err ) return cb( err );

            // It's a directory: rerun the whole thing in that directory
            if( fileStat.isDirectory() ){

              console.log("DIR!", fileNameWithPath );
              return build( fileNameWithPath, dst, info, cb );
            };

            fs.readFile( fileNameWithPath, function( err, fileContentsAsBuffer ){
              if( err ) return cb( err );

              magic.detect( fileContentsAsBuffer, function( err, magic ){

                // Sets the basic file info
                var fileData = {
                  system: {
                    fileNameWithPath: fileNameWithPath,
                    filePath: filePath,
                    fileContentsAsBuffer: fileContentsAsBuffer,

                    fileName: fileName,
                    fileExt: fileName.split('.').pop().toLowerCase(),
                    mimetype: magic,
                    processedBy: [],
                    src: processing.src,
                    dst: processing.dst,
                  },
                  info: cloneObject( info ),
                  contents: fileContentsAsBuffer.toString(),
                  initialContents: fileContentsAsBuffer
                };

                var preProcessFilters = info.preProcessFilters || '';

                filter( preProcessFilters, fileData, function( err, fileData) {
                  if( err ) return cb( err );

                  console.log("RESULT AFTER PREPROCESSFILTERS: ", trimFileData( fileData ) );

                  var defaultPreFilters = fileData.info.defaultPreFilters || '';
                  var filters = fileData.info.filters || '';
                  var defaultPostFilters = fileData.info.defaultPostFilters || '';

                  console.log("FILTERS ARE", filters );

                  filter( [ defaultPreFilters, filters, defaultPostFilters ], fileData, function( err, fileData) {
                    if( err ) return cb( err );

                    console.log("RESULT: ", trimFileData( fileData ) );

                    cb( null );
                  });
                });
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
