
var ryver = require('ryver');
var p = require('path');
var fs = require('fs-extra');
var eventEC = ryver.eventEC;
var async = require('async');

var urlToDestinationList = {}
var urlToAffectedOrigins = {}

// This will run all callbacks registered for the event `watch` when
// a filechange event happens. It does it with a 'queue', to make sure
// that each change is dealt with completely before dealing with
// another change
var watchFiles = exports.watchFiles = function(){
  console.log("Watching files and re-generating in real time" );

  var watchers = [];
  var queue = [];

  ryver.eventEC.emitCollect( 'watch', function( err, results ){
    if( err ) return cb( err );

    // Gather the list of executors
    results.onlyResults().forEach( function( watcher ) {
      watchers.push( { name: watcher.name, executor: watcher.executor } );
    });


    // Run the watcher, adding an 'ignore' option for the destination directory
    // in case it's within the source one
    function stripTrailingSlash( str ){
      return str.substr( -1 ) === '/' ? str.substr(0, str.length - 1 ) : str;
    }
    var chokidar = require('chokidar');
    var fileWatcher = chokidar.watch( ryver.getSrc(), {
      persistent: true,
      ignored: stripTrailingSlash( ryver.getDst() ),
    });

    fileWatcher
      .on('error', function(error) { log('Error happened', error); })
      .on('ready', function() {

        // I don't think I am interested in these ones
        //watcher.on('addDir', function( path ) { log('Directory', path, 'has been added'); })
        //watcher.on('unlinkDir', function( path ) { log('Directory', path, 'has been removed'); })
        //watcher.on('raw', function(event, path, details) { log('Raw event info:', event, path, details); })

        // Makes the returning function, depending on the event name
        var makeCaller = function( event ){
          return function( path ){
            var URL = path.substr( ryver.getSrc().length + 1 );
            console.log('File', URL, 'had a file system event', event, 'on path', path );

            // Filter out events on the same files already in the queue
            queue = queue.filter( function( element) { return element.URL !== URL } );

            // Add element to the queue
            queue.push( { op: event, URL: URL })
          }
        }

        fileWatcher.on('add', makeCaller( 'add' ) );
        fileWatcher.on('change', makeCaller( 'change' ) );
        fileWatcher.on('unlink', makeCaller( 'unlink' ) );

        ryver.log('Initial scan complete. Ready for changes.');
      });

    var running = false;
    setInterval( function(){

      if( !queue.length ) return;

      if( running ){
        ryver.log("There are changes but previous changes are still being dealt with, will wait!" );
      }

      // Destructive copy of queue onto the q variable
      var q = queue.splice( 0, queue.length );

      // For each element in the queue...
      async.eachSeries(
        q,
        function( qEntry, cb ){
          ryver.log("Dealing with entry in queue:", qEntry );
          ryver.log("Number of watchers:", watchers.length );

          // Goes through the watchers, and execute them
          async.eachSeries(
            watchers,
            function( watcher, cb ){
              ryver.log("Executing watcher:", watcher.name );

              watcher.executor.call( this, qEntry.op, qEntry.URL, cb );
            },
            function( err ){
              if( err ) return cb( err );
              cb( null );
            }
          );
        },
        function( err ){
          running = 0;

          // If there was an error, simply print it out (we are in a setInterval) and
          // quit execution
          if( err ) {
            console.log("Error!", err );
            return;
          }

        }
      )

    }, 2000 );
  });

}


eventEC.onCollect( 'watch', function( cb ){

  function deleteTracesOfMaster( URL, cb ){

    // The file might or might not have any destination file.
    // If it doesn't, the array will be empty and async will
    // simply do nothing (except skip to the final callback)

    var toUnlink = urlToDestinationList[ URL ] || [];
    async.each(

      toUnlink,

      function( destFileURL, cb ){
        ryver.log("Deleting destination: ", p.join( ryver.getDst(), destFileURL ) );

        fs.unlink( p.join( ryver.getDst(), destFileURL ), function( err ){
          if( err && err.code === 'ENOENT' ) return cb( null );
          if( err ) return cb( err );
          return cb( null );
        });
      },

      function( err ){
        if( err ) return cb( err );

        ryver.log("Deleting entry", URL, "from originMasterFileURL");

        // Delete the entry from urlToDestinationList
        delete urlToDestinationList[ URL ];

        ryver.log("Looking for ", URL, "in urlToAffectedOrigins (as possible value in array)" );

        // Delete the entry from urlToAffectedOrigins
        // This is trickier as the file could be LISTED anywhere as an index
        Object.keys( urlToAffectedOrigins ).forEach( function( originFileURL ){
          urlToAffectedOrigins[ originFileURL ] = urlToAffectedOrigins[ originFileURL ].filter(
            function( affectedOriginFileURL ){
              return URL !== affectedOriginFileURL;
            }
          );
          if( urlToAffectedOrigins[ originFileURL ].length === 0 ){
            delete urlToAffectedOrigins[ originFileURL ];
          }
        });

        ryver.vlog("urlToAffectedOrigins AFTER DELETION: ", urlToAffectedOrigins );
        cb( null );
      }
    );

  }


  function refilter( toRefilter, cb ){

    ryver.log("Deleting previouly copied files." );

    // Nothing to do!
    //if( ! toRefilter || ! toRefilter.length ) return cb( null );

    async.each(

      toRefilter,

      function( originFileURL, cb ){

        // Always delete traces, since it will be re-filtered anyways
        deleteTracesOfMaster( originFileURL, function( err ){
          if( err ) return cb( err );

          var finalYaml = ryver.yamlFromFileURL( originFileURL );

          ryver.makeFileData( originFileURL, p.dirname( originFileURL ), p.basename( originFileURL), null, finalYaml, true, function( err, fileData ){
            if( err ) return cb( err );

            ryver.vlog("Created fileData:", ryver.trimFileData( fileData ) );

            // Add the file itself to the list of origins since it IS a file on the file system
            //fileData.system.urlToAffectedOrigins.push( originFileURL );

            // Do the filtering, and that's it!
            ryver.filter( fileData, function( err ){
              return cb( null );;
            });
          });
        });
      },

      function( err ){
        if( err ) return cb( err );

        cb( null );

      }
    );
  }



  var f = function( op, URL, cb ){
    ryver.log( "filecopy-watch: Operation", op, "on", URL );

    ryver.vlog("urlToDestinationList:", urlToDestinationList );
    ryver.vlog("urlToAffectedOrigins: ", urlToAffectedOrigins );

    // If a file gets deleted, delete all of its generated results
    if( op === 'unlink' ){
      ryver.log( "Deleting all traces of files generated from:", URL );
      deleteTracesOfMaster( URL, cb );
    }

    // If a file is added or changed, look for it
    if( op === 'add' || op === 'change') {
      ryver.log( "Dealing with changed:", URL, "for:", op );

      // If it's a new file, it's the one being affected
      if( op === 'add' ){
        affectedOrigins = [ URL ];
      } else {
        var affectedOrigins = urlToAffectedOrigins[ URL ] || [];
      }

      var alsoAffectedOrigins = [];

      ryver.log("Files affected by the change:", affectedOrigins.join(',') );

      refilter( affectedOrigins, function( err ){
        if( err ) return cb( err );

        var alsoRefilterListeners = [];
        ryver.eventEC.emitCollect( 'alsoRefilter', function( err, results ){
          if( err ) return cb( err );

          // Gather the list of alsoFilter handlers
          results.onlyResults().forEach( function( alsoRefilterItem ) {
            alsoRefilterListeners.push( { name: alsoRefilterItem.name, executor: alsoRefilterItem.executor } );
          });


          // Goes through the watchers, and execute them
          async.eachSeries(
            alsoRefilterListeners,
            function( listener, cb ){
              ryver.log("Executing watcher to get extra files to filter:", listener.name );

              listener.executor.call( this, affectedOrigins, function( err, more ){
                if( err ) return cb( null );

                more.forEach( function( i ){
                  if( affectedOrigins.indexOf( i ) === -1 && alsoAffectedOrigins.indexOf( i ) === -1 )
                    alsoAffectedOrigins.push( i );
                });
                cb( null );

              });
            },
            function( err ){
              if( err ) return cb( err );

               // At this point, all of the executors have been called.

              //refilter( [], function( err ){
              refilter( alsoAffectedOrigins, function( err ){
                if( err ) return cb( err );

                ryver.log( "Filtering delayed items..." );

                // Filter delayed items, and thats it.
                ryver.filterDelayedItems( function( err ){
                  if( err ) return cb( err );

                  cb( null );
                } );
              });
            }
          );
        });

      });

    }
  }

  // Return the function just defined as the filter
  cb( null, { name: 'watcher-watch', executor: f } );
});


eventEC.onCollect( 'allDone', function( cb ){

  var f = function( cb ){

    //console.log("AH!");
    //console.log("urlToDestinationList:", urlToDestinationList );
    //console.log("urlToAffectedOrigins: ", urlToAffectedOrigins );

    cb( null );
  }

  // Return the function just defined as the filter
  cb( null, { name: 'watcher-alldone', executor: f } );
});


// Keep track of what gets copied over the file system, and make up a data
// structure to know what change will affect what files
// NOTE: This is guaranteed to be run last as the watcher plugin is artificially
// added with the -w option
eventEC.onCollect( 'afterEverything', function( cb ){

  var f = function( fileData, cb ){

    // If the file is to be dropped, goodbye
    if( ! fileData.system.copied ) return cb( null );

    var originMasterFileURL = fileData.system.originMasterFileURL;

    // This will only happen if there IS an origin master file (that is,
    // if the filter is the result of a file that is actually in the source
    // file system
    if( originMasterFileURL && ryver.getWatch() ) {

      var s = fileData.system;

      // Creates an entry in urlToDestinationList if needed.
      // It will map the originMasterFileURL to the actually created files, so that
      // deletion of the source for example will lead to deletion of all resulting files
      urlToDestinationList[ originMasterFileURL ] = urlToDestinationList[ originMasterFileURL ] || [];
      urlToDestinationList[ originMasterFileURL ].push( p.join( fileData.system.filePath, s.fileName + s.fileExt ) );

      // Add the file just filtered as a URL that will need refiltering when this file changes
      urlToAffectedOrigins[ originMasterFileURL ] = urlToAffectedOrigins[ originMasterFileURL ] || [];
      if( urlToAffectedOrigins[ originMasterFileURL ].indexOf( originMasterFileURL ) === -1 )
        urlToAffectedOrigins[ originMasterFileURL ].push( originMasterFileURL );

      // Add each originDependency in fileData as a URL that will need refiltering when
      // this file changes
      fileData.system.originDependencies.forEach( function( dependencyFileURL ){
        urlToAffectedOrigins[ dependencyFileURL ] = urlToAffectedOrigins[ dependencyFileURL ] || [];
        if( urlToAffectedOrigins[ dependencyFileURL ].indexOf( originMasterFileURL ) === -1 )
          urlToAffectedOrigins[ dependencyFileURL ].push( originMasterFileURL );
      });

    }

    cb( null );
  }

  // Return the function just defined as the filter
  cb( null, { name: 'watcher-database', executor: f } );
});
