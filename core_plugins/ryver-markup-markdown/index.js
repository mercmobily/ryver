
var ryver = require('ryver');
//var marked = require('marked');
//var MarkdownIt = require('markdown-it');
var remark = require('remark');
var html = require('remark-html');
var eventEC = ryver.eventEC;

// https://github.com/jonschlinkert/remarkable/issues/238
// https://github.com/wooorm/remark/issues/210
// https://github.com/markdown-it/markdown-it/issues/292

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

    /*
    // MARKED
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
    */

    /*
    // MARKDOWN
    fileData.contents = markdown.toHTML( fileData.contents );
    */

    /*
    // MARKDOWNIT
    md = new MarkdownIt({
      html: true
    });
    fileData.contents = md.render( fileData.contents );
    */

    // REMARK
    fileData.contents = remark().use(html).process( fileData.contents );

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
