
var ryver = require('../..');
var MarkdownIt = require('markdown-it');
var eventEC = ryver.eventEC;

var markdownParser = new MarkdownIt({
  html: false,
});

eventEC.onCollect( 'filter', function( cb ){

  var f = function( fileData, cb ){

    // This filter will only work on text files (of any kind)
    if( fileData.system.mimetype.split('/')[0] !== 'text'){
      ryver.log( "File ignored as mime type is not 'text'" );
      return cb( null, fileData);
    }

    if( fileData.system.fileExt !== '.md' && fileData.system.fileExt !== '.markdown'){
      ryver.log( "File ignored as extension isn't .md or .markdown: ", fileData.system.fileExt );
      return cb( null, fileData )
    }

    //console.log("BEFORE THE CURE:");
    //console.log( fileData.contents );

    fileData.contents = markdownParser.render( fileData.contents );

    //console.log("AFTER THE CURE:");
    //console.log( fileData.contents );

    ryver.log("Changing file extension and mime type to html" );
    ryver.setSystemData( fileData.system, 'fileExt', '.html' );
    ryver.setSystemData( fileData.system, 'mimetype', 'text/html' );

    // All done.
    cb( null, fileData );
  }

  // Return the function just defined as the filter
  cb( null, { name: 'markup-markdown', executor: f } );
});
