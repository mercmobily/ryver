
var ryver = require('ryver');
var ejs = require('ejs');
var p = require('path');
var crypto = require('crypto');

var eventEC = ryver.eventEC;

function makeHash(){
  return crypto.createHash('md5').update( (Math.random()*1000000).toString() ).digest('hex');
}

eventEC.onCollect( 'afterPreProcessFilters', function( cb ){

  var f = function( fileData, cb ){


    var hashTable = fileData.system.ejsHashTable = {};

    // This filter will only work on text files (of any kind)
    // and ONLY IF EJS IS IN THE PIPELINE!
    if( fileData.system.mimetype.split('/')[0] !== 'text'){

      ryver.log( "File ignored as mime type is not 'text'" );
      return cb( null, fileData);

    } else {

      if(  !fileData.info.filtersPipeline ||  !fileData.info.filtersPipeline.find( function( i ) { return i.name == 'template-ejs'} ) ){
        ryver.log( "File ignored as file won't be processed by EJS later" );
        return cb( null, fileData);
      }
    }

    var found = false;
    var b = fileData.contents;
    // Convert anything that is ejs into an MD5. This will prevent any kind of escaping
    fileData.contents = fileData.contents.replace( /(\<\%[^\%][\s\S]*?\%\>)/gm, function( match, type ){
      var h = makeHash();
      hashTable[ h ] = match;
      found = true;
      return h;
    });

    if( Object.keys( hashTable ).length ){
      fileData.system.hasEjs = true;
      ryver.vlog( "EJS preserving. Contents before the 'cure':", b );
      ryver.vlog( "...and after the 'cure':", fileData.contents );
      ryver.log("File had EJS tags, which were mapped away to prevent any escaping");
    }

    cb( null );
  }

  // Return the function just defined as the filter
  cb( null, { name: 'ejs-saver', executor: f } );
});

eventEC.onCollect( 'filter', function( cb ){

  var f = function( fileData, cb ){

    // This filter will only work on text files (of any kind)
    if( fileData.system.mimetype.split('/')[0] !== 'text'){
      ryver.log( "File ignored as mime type is not 'text':", fileData.system.mimetype );
      return cb( null, fileData);
    }


    // The hash table from the system
    var hashTable = fileData.system.ejsHashTable;

    // NOTE: The next 3 lines are wrong, since there could be tags even without
    // anything in the hash, since the hash table only happens to the actual contents
    //if( !Object.keys( hashTable ).length ){
    //  return cb( null, fileData);
    //}

    ryver.log( "File had EJS tags, restoring them now!" );

    ryver.vlog( "EJS restoring. Contents before the 'cure':", fileData.contents );
    // Resolve any hash contents in the file
    Object.keys( hashTable ).forEach( function( hash ){
      fileData.contents = fileData.contents.replace( hash, hashTable[ hash ] );
    })

    // TODO: Take this out
    fileData.info.inspect = require('util').inspect;

    // Work out (and pass) `filename` so that the include directive works
    var s = fileData.system;
    var filename = p.join( ryver.getSrc(), s.filePath, s.fileName + s.fileExt );
 
    ryver.vlog("Contents before running EJS filter, with EJS tags restored:", fileData.contents );
    fileData.contents = ejs.render( fileData.contents, fileData, { filename: filename} );
    ryver.vlog("Contents after running EJS filter:", fileData.contents );

    cb( null );
  }

  // Return the function just defined as the filter
  cb( null, { name: 'template-ejs', executor: f } );
});
