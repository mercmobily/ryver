
var ryver = require('ryver');
var marked = require('marked');
//var markdown = require('markdown').markdown;

var eventEC = ryver.eventEC;

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

    marked.setOptions({
      //renderer: new marked.Renderer(),
      gfm: true,
      tables: true,
      breaks: false,
      pedantic: false,
      sanitize: false,
      smartLists: true,
      smartypants: true
    });

    fileData.contents = marked( fileData.contents );
    //fileData.contents = markdown.toHTML( fileData.contents );

    ryver.log("Changing file extension and mime type to html" );
    ryver.setSystemData( fileData.system, 'fileExt', '.html' );
    ryver.setSystemData( fileData.system, 'mimetype', 'text/html' );

    // All done.
    cb( null, fileData );
  }

  // Return the function just defined as the filter
  cb( null, { name: 'markup-markdown', executor: f } );
});
