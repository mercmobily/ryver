
var ryver = require('ryver');
var p = require('path');
var fs = require('fs-extra');
var eventEC = ryver.eventEC;
var async = require('async');

eventEC.onCollect( 'afterEverything', function( cb ){

  var f = function( fileData, cb ){

    // If the file is to be dropped, goodbye
    if( fileData.info.drop ) return cb( null );

    ryver.vlog( "Full file path is", fileData.system.filePath );

    // Make up the full destination of the file relative to `dst`
    var fullDest = p.join( ryver.getDst(), fileData.system.filePath );

    ryver.vlog( "Final destination, with `dst` in front is ", fullDest );

    // Make the containing directory in the destination folder
    fs.mkdirp( p.join( fullDest ), function( err ){
      if( err ) return cb( err );

      var s = fileData.system;
      fs.writeFile( p.join( fullDest, s.fileName + s.fileExt ), fileData.contents, function( err ){
        if( err ) return cb( err );

        fileData.system.copied = true;
        cb( null );
      });

    });
  }

  // Return the function just defined as the filter
  cb( null, { name: 'filecopy', executor: f } );
});
