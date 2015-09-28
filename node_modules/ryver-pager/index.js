
var ryver = require('ryver');
var p = require('path');
var async = require('async');

var eventEC = ryver.eventEC;

var DO = require( 'deepobject');

// pager -- split a file into slices, providing a pagerData variable
//          so that pages can render the pages
eventEC.onCollect( 'filter', function( cb ){

  var f = function( fileData, cb ){

    var config = ryver.getConfig();
    var pageSeparator = config.pageSeparator || '<!--pagebreak-->';
    var pageFileName  = config.pageFileName || '{{originalName}}_{{number}}';

    // This filter will only work on text files (of any kind)
    if( fileData.system.mimetype.split('/')[0] !== 'text'){
      ryver.log( "File ignored by plugin pager as mime type is not 'text':", fileData.system.mimetype );
      return cb( null, fileData);
    }

    var pieces = fileData.contents.split( pageSeparator );

    // This filter will only work on text files (of any kind)
    if( pieces.length == 1 ){
      ryver.log( "File ignored by plugin pager as there is no fileSeparator in the contents" );
      return cb( null, fileData);
    }

    ryver.log( "Paging is happening!" , pieces.length );

    ryver.log( "Number of pieces:" , pieces.length );

    // This needs to be here
    var i;

    var totalPages = pieces.length;

    var pagerMaster = [];
    for( i = 1; i <= totalPages; i++ ){
      if( i == 1 ) pagerPageName = fileData.system.fileName;
      else pagerPageName = pageFileName
                           .replace('{{originalName}}', fileData.system.fileName )
                           .replace( '{{number}}', i );
      pagerMaster.push( { pageNumber: i, pageName: pagerPageName, thisPage: false } );
    }

    i = 1;
    async.whilst(
      function(){ return i < pieces.length },
      function( cb ){

        // Make up basic pagerData
        // To keep it consistent with ryver-lister, it has elementsPerPage,
        // inPageLength and totalElements set assuming ONE element per page
        var pagerData = {
          pageNumber: i + 1,
          totalElements: pagerMaster.length,
          totalPages: pagerMaster.length,
          elementsPerPage: 1,
          pager: ryver.cloneObject( pagerMaster ),
          inPageLength: 1,
        };

        // Work out prevPageName
        if( i == 1 ){
          pagerData.prevPageName = fileData.system.fileName;
        } else {
          pagerData.prevPageName = pageFileName
                                  .replace('{{originalName}}', fileData.system.fileName )
                                  .replace( '{{number}}', i  );
        }
        // Work out nextPageName
        if( i != pieces.length - 1 ){
          pagerData.nextPageName = pageFileName
                                  .replace('{{originalName}}', fileData.system.fileName )
                                  .replace( '{{number}}', i + 2);
        }

        // Make the current page "active" within pagerData.pager
        pagerData.pager[ i ].thisPage = true;

        // Make a clone of the "master" fileData
        var newFileData = ryver.cloneObject( fileData );

        // Set the current piece as the contents of the "clone"
        newFileData.contents = pieces[ i ];

        // Assign the created pagerData
        newFileData.info.pagerData = pagerData;

        // Work out the new file name, based on the pageFileName template
        var oldFileName = newFileData.system.fileName
        var newFileName = pageFileName.replace('{{originalName}}', oldFileName ).replace( '{{number}}', i + 1 );

        // Sets the fileName in system (a history of changes will be kept)
        ryver.setSystemData( newFileData.system, "fileName", newFileName );

        ryver.log( "New page made for page ", i + 1 );
        ryver.vlog( "newFileData for created page:" );
        ryver.vlog( function(){
          ryver.vlog( ryver.trimFileData( newFileData ) );
        });


        // Actually run filtering for that file
        ryver.filter( newFileData, function( err ){
          if( err ) return cb( err );

          i++;

          cb( null );
        });

      },
      function( err ){
        if( err ) return cb( err );

        // Make up basic pagerData
        // To keep it consistent with ryver-lister, it has elementsPerPage,
        // inPageLength and totalElements set assuming ONE element per page
        var pagerData = {
          pageNumber: 1,
          totalElements: pagerMaster.length,
          totalPages: pagerMaster.length,
          elementsPerPage: 1,
          pager: ryver.cloneObject( pagerMaster ),
          inPageLength: 1,
        };

        // Work out nextPageName
        pagerData.nextPageName = pageFileName
                                  .replace('{{originalName}}', fileData.system.fileName )
                                  .replace( '{{number}}', 2 );

        // Make the current page "active" within pagerData.pager
        pagerData.pager[ 0 ].thisPage = true;

        // Assign the created pagerData
        fileData.info.pagerData = pagerData;

        // The "original" file is cut to the first fragment
        fileData.contents = pieces[ 0 ];

        ryver.log( "Main fileData changed to take out following pages and added pager" );
        ryver.vlog( "original fileData is now:" );
        ryver.vlog( function(){
          ryver.vlog( ryver.trimFileData( fileData ) );
        });

        return cb( null );
      }
    );
  }

  // Return the function just defined as the filter
  cb( null, { name: 'pager', executor: f } );
});
