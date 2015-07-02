
var async = require('async');
var asyncReplace = require( 'async-replace');
var fs = require('fs')
var p = require('path')
var EventEmitterCollector = require("eventemittercollector");
var EventEmitter = require('events').EventEmitter;
var mmm = require('mmmagic');

var files, info, fileStat, fileWithPath;

var eventEC = new EventEmitterCollector;
var Magic = mmm.Magic;
var magic = new Magic( mmm.MAGIC_MIME_TYPE );
var yaml = require('js-yaml');

var tags = {};

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

  * [ ] Layout templates
      [ ] Add filter that will apply a template and change file name and ext
      [ ] Add original contents, name and ext to data structure
          https://github.com/chjj/marked

  * [ ] Add afterFilter hook to copy files over respecting new info

  * [ ] Create plugins file structure, include code ones, allow non-core ones
  * [ ] Add way to prioritise plugins

  * [ ] Add additional common plugins

Plugins are:

* init()
  They activate listening to events etc.

Events:
* filterBeforePlugins
* filterAfterPlugins
* filterDone

*/

/*
registerTag( 'testTag', function( tagParams, fileContents, fileInfo, cb ){
  cb( null, "TAG RUN! Params were: " + tagParams.join('-') );
});


registerTag( 'include', function( tagParams, fileContents, fileInfo, cb ){
  fs.readFile( p.join( fileInfo.path, tagParams[ 1 ] ), function( err, included ){
    if( err ) return cb( err );

    cb( null, included );
  });
});
*/


function pluginResolver( fileContents, fileInfo, cb ){
  resolveTags( fileContents, fileInfo, cb );
}

// callback( tagParams, fileContents, fileInfo, done )
function registerTag( tagName, callback ){

  // Check that the tag is not already defined
  if( typeof tags[ tagName ] !== 'undefined' ){
    callback( new Error("Tag already defined: " + tagName ) );
  }

  // Assign the tag
  tags[ tagName ] = callback;
}

function resolveTags( fileContents, fileInfo, cb ){

  asyncReplace( fileContents, /\[\[(.*?)\]\]/g,
    function( match, p1, offset, string, done  ){

       // Found a tag marker: apply the registered tag
       var tagParams = p1.split( ' ' );
       var tag = tagParams[ 0 ];

       // Tag is not defined: return whatever was there in the first place
       if( typeof tags[ tag ] === 'undefined' ) return done( null, match );

       // Run the function associated to that tag
       tags[ tag ]( tagParams, fileContents, fileInfo, done );

    },
    function( err, result ){
      cb( null, result, fileInfo );
    }
  );

}

eventEC.onCollect( 'afterFilters', function( cb ){

  var f = function( fileContents, fileInfo, cb ){
    cb( null );
  }

  cb( null, f );

});


// Read header, save data in it
eventEC.onCollect( 'filterBeforePlugins', function( cb ){

  var p1 = function( fileContents, fileInfo, cb ){

    // This filter will only work on text files (of any kind)
    if( fileInfo.mimetype.split('/')[0] !== 'text') return cb( null, fileContents, fileInfo);

    // Wrapping both replace() and yaml.safeLoad in try/catch so that
    // if anything goes wrong the callback gets called correctly
    try {
      fileContents = fileContents.replace(/^---\n([\s\S]*)\n---\n/m, function( match, p1, offset, string) {

        frontMatter = yaml.safeLoad( p1, { filename: fileInfo.fileWithPath } );

        // Assign the parsed frontMatter to fileInfo
        fileInfo.frontMatter = frontMatter;

        // This will ensure that frontMatter will disappear, as it should
        return '';
        ;
      });

    } catch ( e ) {
      return cb( e );
    }

    // All done. At this point, fileContents might have the front matter missing and fileInfo
    // might have the frontMatter attribute added to it
    cb( null, fileContents, fileInfo );
  }

  // Return the function just defined as the filter
  cb( null, p1 );
});


// Read header, save data in it
eventEC.onCollect( 'filterBeforePlugins', function( cb ){

  var p1 = function( fileContents, fileInfo, cb ){
    fileContents += " PROCESSED 1";

    cb( null, fileContents, fileInfo );
  }

  cb( null, p1 );

});

eventEC.onCollect( 'filterAfterPlugins', function( cb ){

  var p1 = function( fileContents, fileInfo, cb ){
    fileContents += " PROCESSED 2";

    cb( null, fileContents, fileInfo );
  }

  cb( null, p1 );

});


// Go through every file, and emit an event for each one
function go( path, cb ){

  fs.readdir( path, function( err, files ){
    if( err ) return cb( err );

    console.log( "FILES:", files );

    var info = null;
    if( files.indexOf( 'info.yaml' ) !== -1 ){

      fs.readFile( p.join( path, 'info.yaml' ), function( err, loadedInfo ){
        if( err ) return cb( err );

        try {
          info = yaml.safeLoad( loadedInfo, { filename: p.join( path, 'info.json' ) } );
        } catch ( e ){
          return cb( e );
        }
        restOfFunction();
      });
    } else {
      restOfFunction();
    }

    function restOfFunction(){

      async.eachSeries(
        files,
        function( file, cb ){

          if( file[ 0 ] === '_' ) return cb( null );

          var fileWithPath = p.join( path, file );

          fs.lstat( fileWithPath, function( err, fileStat ){
            if( err ) return cb( err );

            // It's a directory: rerun the whole thing in that directory
            if( fileStat.isDirectory() ){

              console.log("DIR!", fileWithPath );
              return go( fileWithPath, cb );
            };


            fs.readFile( fileWithPath, function( err, fileContentsAsBuffer ){
              if( err ) return cb( err );

              fileContents = fileContentsAsBuffer.toString();

              magic.detect( fileContentsAsBuffer, function( err, magic ){

                // Sets the basic file info
                var fileInfo = {
                  file: file,
                  fileWithPath: fileWithPath,
                  path: path,
                  fileContentsAsBuffer: fileContentsAsBuffer,
                  info: info,
                  mimetype: magic
                };

                eventEC.emitCollect( 'filterBeforePlugins', function( err, beforePlugins ){
                  if( err ) return cb( err );

                  eventEC.emitCollect( 'filterAfterPlugins', function( err, afterPlugins ){
                    if( err ) return cb( err );

                    var toExecute = [ function( cb ){
                      return cb( null, fileContents, fileInfo );
                    } ].concat( beforePlugins.onlyResults(), pluginResolver, afterPlugins.onlyResults() );


                    async.waterfall( toExecute, function( err, fileContents, fileInfo){
                      if( err ) return cb( err );

                      eventEC.emitCollect( 'afterFilter', function( err, afterFilters ){
                        if( err ) return cb( err );

                        async.applyEach( afterFilters.onlyResults(), fileContents, fileInfo, function( err ){

                          if( err ) return cb( null );

                          console.log("RESULT: ", fileInfo );

                          cb( null );
                        });
                      });
            		    })
            		  })
            		})
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

// Let the fun begin!
go( 'test', function( err ){
  if( err ){
    console.log("ERROR! ", err );
    process.exit();
  }

  console.log("ALL FINISED!");
});
