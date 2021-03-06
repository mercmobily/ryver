
var ryver = require('ryver');
var p = require('path');
fs = require('fs-extra');

var eventEC = ryver.eventEC;

eventEC.onCollect( 'filter', function( cb ){

  var f = function( fileData, cb ){

    var landing = fileData.info.landing;

    if( ! landing ){
      ryver.log("No landing set in fileInfo, skipping");
      return cb( null, fileData );
    }

    var source;

    var mainPath = fileData.system.filePath;
    var backupPath = ryver.getConfig().includesFolder || '_includes';

    // Load the contents of the landing file
    ryver.readFile( mainPath, backupPath, landing, function( err, landingContentsAsBuffer, usedBackup ){
      if( err ) return cb( err );

      var originPath = usedBackup ? backupPath : mainPath;

      // Make a new fileData based on:
      //  * the landing's extension
      //  * the file's own path, name
      //  * the landing file's contents
      //  * the directory's initial info
      var s = fileData.system;
      var landingExt = '.' + fileData.info.landing.split('.').pop();
      ryver.makeFileData( fileData.system.originMasterFileURL, s.filePath, s.fileName + landingExt, landingContentsAsBuffer, ryver.cloneObject( fileData.initialInfo ), false, function( err, landingFileData ){
        if( err ) return cb( err );

        // Add the landing file as origin for this file, since -- if it changes -- the file will
        // also need to change
        fileData.system.originDependencies.push( p.join( originPath, landing ) );
        landingFileData.system.originDependencies.push( p.join( originPath, landing ) );

        // Rename the file currently being filtered
        var postFix = ( fileData.info.landingPostfix || "_real");
        ryver.setSystemData( fileData.system, 'fileName', fileData.system.fileName + postFix );

        // Add originalDestinaton to the landing file's info so that it knows where
        // to redirect users
        landingFileData.info.originalDestination = fileData.system.fileName + fileData.system.fileExt;

        // Make the original destination's fileData available
        landingFileData.info.originalFileInfo = ryver.cloneObject( fileData.info );

        // Apply filters to the newly created landing page
        ryver.filter( landingFileData, function( err ){
          if( err )return cb( err );

          cb( null );
        })
      });
    });
  }

  // Return the function just defined as the filter
  cb( null, { name: 'landing', executor: f } );
});
