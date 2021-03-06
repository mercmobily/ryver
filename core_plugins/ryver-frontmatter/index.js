
var ryver = require('ryver');
var yaml = require('js-yaml');

var p = require('path');

var eventEC = ryver.eventEC;

eventEC.onCollect( 'beforePreProcessFilters', function( cb ){

  var f = function( fileData, cb ){

    // This filter will only work on text files (of any kind)
    if( fileData.system.mimetype.split('/')[0] !== 'text'){
      ryver.log( "File ignored as mime type is not 'text'" );
      return cb( null, fileData);
    }

    // Wrapping both replace() and yaml.safeLoad in try/catch so that
    // if anything goes wrong the callback gets called correctly
    try {
      fileData.contents = fileData.contents.replace(/^---[\r\n]+([\s\S]*)[\r\n]+---[\r\n]+/m, function( match, p1, offset, string) {

        frontMatter = yaml.safeLoad( p1, { filename: p.join( fileData.system.fileName, fileData.system.filePath) } );
        ryver.enrichObject( fileData.info, frontMatter );

        // This will ensure that frontMatter will disappear, as it should
        return '';
        ;
      });

    } catch ( e ) {
      return cb( e );
    }

    // All done. At this point, fileContents might have the front matter missing and fileData
    // might have the frontMatter attribute added to it
    cb( null );
  }

  // Return the function just defined as the filter
  cb( null, { name: 'frontmatter', executor: f } );
});
