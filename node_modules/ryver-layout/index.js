
var ryver = require('ryver');
var fs = require('fs');
var p = require('path');

var eventEC = ryver.eventEC;

eventEC.onCollect( 'filter', function( cb ){

  var f = function( fileData, cb ){

    // This filter will only work on text files (of any kind)
    if( fileData.system.mimetype.split('/')[0] !== 'text'){
      ryver.log( "File ignored by plugin layout as mime type is not 'text':", fileData.system.mimetype );
      return cb( null, fileData);
    }

    // Sets the layout. If it's not defined, quit it
    var layout = fileData.info.layout;
    if( !layout ){
      ryver.log( "No layout set in fileInfo, skipping" );
      return cb( null, fileData );
    }

    var layoutsFolder = ryver.getConfig().layoutsFolder || '_layouts';
    ryver.readFile( layoutsFolder, null, layout, function( err, templatefileContentsAsBuffer ){
      if( err ) return cb( err );

      // Add the layout file to the list of origin
      fileData.system.originDependencies.push( p.join( layoutsFolder, layout ) );

      var templatefileContents = templatefileContentsAsBuffer.toString();

      var templatefileContentsParts = templatefileContents.split('<!--contents-->' );
      if( templatefileContentsParts.length  != 2 ) return cb( new Error("Tag <!--contents--> not found in template") );

      fileData.contents = templatefileContentsParts[ 0 ] + fileData.contents + templatefileContentsParts[ 1 ];

      // All done.
      cb( null );
    });
  }

  // Return the function just defined as the filter
  cb( null, { name: 'layout', executor: f } );
});
