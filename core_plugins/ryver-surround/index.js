
var ryver = require('ryver');
//var markdown = require('markdown').markdown;

var eventEC = ryver.eventEC;

eventEC.onCollect( 'filter', function( cb ){

  var f = function( fileData, cb ){

    fileData.contents = fileData.info.surroundBefore + fileData.contents + fileData.info.surroundAfter;
 
    // All done.
    cb( null, fileData );
  }

  // Return the function just defined as the filter
  cb( null, { name: 'surround', executor: f } );
});
