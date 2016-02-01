
var ryver = require('ryver');
var p = require('path');
var async = require('async');

var eventEC = ryver.eventEC;

var listData = {};
var DO = require( 'deepobject');

var skipMe = false;

/*

DATA SUMMARY:

*
Configuration happens in `_config.yaml` which has something like (for `tags` and `categories`):

  listVars:
    tags:
      indexFolder: tags/{{name}} // OPTIONAL. Only if you want page generation
      perPage: 5                 // OPTIONAL. Only applies to generated pages
      sortBy: date
    categories:
      indexFolder: categories/{{name}}
      perPage: 5
      sortBy: date

  listAll:
    indexFolder: articles
    perPage: 10
    sortBy: date

  listTemplate: _listTemplate.md
  listMainPageName: index
  listNumberPageName: index_{{number}}

This configuration means that automatically when a file has in info.yaml or frontmatter BOTH
`listed` set to true, and something like this:

  categories: cat1,cat2,cat3

The `categories` attribute will be special (see next section)

*
listData contains all of the items with `listed` set to `true` in their info.yaml where:
  _ALL_: [ fileData, fileData, fileData, ... ]
  tags:
    tag1: [ fileData, fileData, fileData, ... ]
    tag2: [ fileData, fileData, fileData, ... ]
  categories:
    cat1: [ fileData, fileData, fileData, ... ]
    cat2: [ fileData, fileData, fileData, ... ]

The fact that `_ALL_` is special (it contains an array straight, rather than a hash) does mean that, while cycling, you need to check for it.

*
A page might instruct ryver that it wants to have a list of latest entries:

  makeListLatestVars:
    _ALL_: 10
    categories.security: 15

If this is set, info.listLatestData will have relevant latest data.

*
For each element where `indexFolder` is set, Ryver will create several paged files (for example `tags/{{name}}`) one per tag name.


*/


// Return the list of files to re-filter
eventEC.onCollect( 'alsoRefilter', function( cb ){

  var f = function( affectedOrigins, cb ){

    // Make a list of files that are affected
    // TODO: See if it's feasible to narrow this down to just the ones
    // with the changed categories, although it does feel like it's more
    // work than it's worth it
    var r = [];
    listData._ALL_.forEach( function( item ){
      r.push( p.join( item.system.filePath, item.system.fileName ) + item.system.fileExt );
    })

    // Re-make affected lists.
    // TODO: See if it's feasible to narrow this down to just the ones
    // with the changed categories, although it does feel like it's more
    // work than it's worth it
    makeLists( null, function( err ){
      if( err ) return cb( err );

      // A "MAYBE" WRITEUP ON HOW TO IMPLEMENT NARROWING DOWN
      /*
      * Make data structure that, for each category/tag, stores the list of values for a URL
      * Make copy of structure with "old" values
      * Write function that, given the URL, creates a list of "changed" ones (with path)
      * Make a alsoRefilter hook that given a URL:
        * runs the "getChangedValues" function
        * looks for each returned entry in listData using DeepObject, adds each entry's URL to result
        * Return result as list of URLs as array
        * saves the list of changed ones (involvedOnes)

    - Refilter lists
      * Add parameter to makeLists so that you can pass it involvedOnes
      * If involvedOnes is present, it will only call makeList for the changed one and _ALL_. Otherwise,
        it will use existing code
      */

      return cb( null, r );
    });
  }

  // Return the function just defined as the filter
  cb( null, { name: 'listdata-gatherer', executor: f } );
});


function deleteFromListData( fileData ){

  function deleteAllFileDataMatch( array ){

    var item;
    var i = array.length;
    while( i-- ){

      item = array[i];

      if(
        fileData.system.filePath == item.system.filePath &&
        fileData.system.fileName == item.system.fileName &&
        fileData.system.fileExt == item.system.fileExt
      ){
        array.splice(i, 1);
      }
    }
  }


  deleteAllFileDataMatch( listData._ALL_ );
  Object.keys( listData ).forEach( function( list ){
    if( list === '_ALL_' ) return;
    Object.keys( listData[ list ] ).forEach( function( value ){
      deleteAllFileDataMatch( listData[ list ] [ value ] );
    })
  });


}

// lister -- delete, and (re?)place, entry in listData
eventEC.onCollect( 'afterFilters', function( cb ){

  var f = function( fileData, cb ){

    // If module is to be skipped, skip
    if( skipMe ) return cb( null );


    // If it has makeListLatestVars, it will force the file to fileData.info.delayPostProcess
    if( fileData.info.makeListLatestVars ){
      fileData.system.delayPostProcess = true;
    }

    // Initialise _ALL_ if needed
    listData._ALL_ = listData._ALL_ || [];

    // If it's not "listed", then it won't be in the picture at all
    if( ! fileData.info.listed ){
      ryver.log("Will NOT gather");
      return cb( null, fileData );
    }
    ryver.log("WILL GATHER! (information about this file)");

    // Delete the element. The element could be there if this is a
    // refilter
    deleteFromListData( fileData );

    // Add file to the main list of all files

    listData._ALL_.push( fileData );
    // listVars will have the list of "list variables",
    // e.g. 'tags', 'category'
    var listVars = ryver.getConfig().listVars;

    // No listing variables to do for this file
    if( typeof listVars !== 'object') return cb( null, fileData );

    var lists = Object.keys( listVars );

    // For each listVar set in the config, check if there's a
    // fileata.info[ list ] in the file's data -- if so, it will represent
    // a list of "values"
    lists.forEach( function( list ){
      if( ! fileData.info[ list ] ) return;

      // Initialise listData for that list if needed
      listData[ list ] = listData[ list ] || {};

      // Get list values as an array
      var listValues = fileData.info[ list ].split( ',' );
      if( listValues.length === 1 && listValues[ 0 ] == '' ) return;

      listValues.forEach( function( value ){
        listData[ list ] [ value ] = listData[ list ] [ value ] || [];
        listData[ list ] [ value ].push( fileData );
      })
    })

    return cb( null );
  }

  // Return the function just defined as the filter
  cb( null, { name: 'listdata-gatherer', executor: f } );
});

// Before running the delayed postProcessFilters, it will
// make sure that data is properly sorted
eventEC.onCollect( 'beforeDelayedPostProcess', function( cb ){

  var f = function( fileData, cb ){

    // If module is to be skipped, skip
    if( skipMe ) return cb( null );

    var makeSorter = function( sortField ){
      return function( a, b ){
        if( a.info[ sortField ] === b.info[ sortField ] ) return 0;
        if( a.info[ sortField ] >   b.info[ sortField ] ) return 1;
        if( a.info[ sortField ] <   b.info[ sortField ] ) return -1;
      }
    };

    // Sort the main (FULL) list of pages
    if( listData._ALL_ ){
      listData._ALL_.sort( ryver.getConfig().listAll.sortBy );
    }

    // Sort the sub-lists, if they are to be sorted
    var config = ryver.getConfig().listVars;
    Object.keys( listData ).forEach( function( list ){
      if( list === '_ALL_' ) return;
      var sortField = config[ list ].sortBy;
      Object.keys( listData[ list ] ).forEach( function( value ){
        listData[ list ] [ value ].sort( makeSorter( sortField ) );
      })
    });

    cb( null );
  }

  // Return the function just defined as the filter
  cb( null, { name: 'listdata-sorter', executor: f } );
});

// lister-vars -- making info.listLatestData when info.listLatestData is set
eventEC.onCollect( 'beforeDelayedPostProcess', function( cb ){

  var f = function( fileData, cb ){

    ryver.log( "Setting listLatest variables");

    // Make up fileData.info.listLatestData based on
    // fileData.info.makeListLatestVars
    // The data will be taken from listData
    fileData.info.listLatestData = {};
    for( var list in fileData.info.makeListLatestVars ){

      // Setting `data` and `howMany`
      var data = DO.get( listData, list ) || [];
      var howMany = fileData.info.makeListLatestVars[ list ];

      fileData.info.listLatestData[ list ] = data.slice( 0, howMany - 1 );
    };
    return cb( null );
  }

  // Return the function just defined as the filter
  cb( null, { name: 'lister-latest-vars', executor: f } );
});


function makeLists( involvedOnes, cb ){

  var config = ryver.getConfig();

  var templatesDir = config.templatesFolder || '_templates';
  var templateNameAndExt= config.listTemplate || '_listTemplate.html';

  // Load the contents of the list template file
  ryver.readFile( templatesDir, null, templateNameAndExt, function( err, listTemplateAsBuffer ){
    if( err ) return cb( err );

    // Calling the generating function passing the right value, config, data
    async.eachSeries(

      Object.keys( listData ),

      function( listName, cb ){
        if( listName === '_ALL_' ){
          makeList( listName, config.listAll, listData._ALL_, cb );
        } else {

          async.eachSeries(
            Object.keys( listData [ listName ] ),
            function( value, cb ){
              makeList( value, config.listVars[ listName ], listData[ listName ][ value ], cb );
            },
            function( err ){
              if( err ) return cb( err );
              cb( null );
            }
          );

        }
      },
      function( err ){
        if( err ) return cb( err );

        cb( null );
      }
    );

    // Beginning of makeList
    function makeList( valueName, c, data, cb ){
      ryver.log("Making up list:", valueName, "configured as:", c, "Number of items:", data.length );

      // If indexfolder is not specified, simply doesn't create the files.
      // The information will still be in the data structures, so that things like
      // makeListLatestVars will still work (even though the paged list isnt created)
      if( !c.indexFolder ) return cb( null );

      var filePath = c.indexFolder.replace('{{name}}', valueName );
      ryver.log("File folder", c.indexFolder, "resolved as: ", filePath );

      // Get the extension of the template file
      var templateFileExt = p.extname( templateNameAndExt );

      // Make a copy of data.
      // This copy will be then spliced
      var d = data.slice();

      // Starting point, from page 1
      var pageNumber = 1;

      // Variables that will be used in the passed `info.listerData` object
      var totalElements = d.length;
      var totalPages = Math.floor( (d.length - 1 ) / c.perPage )  + 1;
      var elementsPerPage = c.perPage;

      async.whilst(
        function(){
          return ( inPage = d.splice( 0, c.perPage ) ).length;
        },
        function( cb ){
          ryver.log("Processing page:", inPage.length );

          var fileName, prevFileName, nextFileName;

          // Make up the page name
          var listNumberPageName = config.listNumberPageName || 'index_{{number}}';
          var listMainPageName = config.listMainPageName || 'index';

          // **** WORK OUT fileName, nextFileName, prevFileName ****

          // Work out nextFileName
          if( pageNumber != totalPages )
            var nextFileName = listNumberPageName.replace( '{{number}}', pageNumber + 1 );

          // Work out prevFileName
          // Take care of the case where it's at the second page number, and
          // the previous page is just listMainPageName
          if( pageNumber == 1 ){
            // Noop
          } else if( pageNumber == 2 )
            prevFileName = listMainPageName;
          else
            prevFileName = listNumberPageName.replace( '{{number}}', pageNumber - 1 );

          // Work out own fileName, depending on the page name (first one is listMainPageName)
          if( pageNumber == 1 )
            fileName = listMainPageName;
          else
            fileName = config.listNumberPageName.replace( '{{number}}', pageNumber );

          // **** WORK OUT fileName, nextFileName, prevFileName ****

          ryver.log( "fileName resolved as:", fileName );

          // Enrich fileData with whatever is in _info.yaml placed in
          // the _source_ directory
          ryver.readYamlFile( ryver.getMainInfo(), filePath, '_info.yaml', function( err, info ){

            var maxPagesInPager = info.maxPagesInPager || 10;

            var pager = [];
            for( var i = 1; i <= totalPages; i++ ){
              var thisPage = ( i == pageNumber );
              if( i == 1 ) pagerPageName = listMainPageName;
              else pagerPageName = listNumberPageName.replace( '{{number}}', i );
              pager.push( { pageNumber: i, pageName: pagerPageName, thisPage: thisPage } );
            }

            // Cut the pager if necessary
            // Comments from now on assume 10 items per page, 137 items
            // 14 pager elements, pager.length is 14
            // max items 10
            //
            // For boundary test:

            // pager.length = 13
            // First index of array: 0
            // last index of array: 12
            // maxPagesInPager = 10
            // halfMaxPagesInPager = 5
            //
            // Shifting:
            // Page 1 : delta -4, start 0 (last index: 9)
            // Page 2 : delta -3, start 0 (last index: 9)
            // Page 3 : delta -2, start 0 (last index: 9)
            // Page 4 : delta -1, start 0 (last index: 9)
            // Page 5 : delta 0,  start 0 (last index: 9)

            // Page 6 : delta 1,  start 1 (last index: 10)
            // Page 7 : delta 2,  start 2 (last index: 11)
            // Page 8 : delta 3,  start 3 (last index: 12)

            // Page 9 : delta 4,  start 3 (last index: 12)
            // Page 10: delta 5,  start 3 (last index: 12)

            // Set basic starting variables
            var halfMaxPagesInPager = Math.floor( maxPagesInPager / 2 );
            var start = 0, length = pager.length;

            // If there are more pages than the length of the pager...
            if( length > maxPagesInPager ){

              // If it's over the half-length of the pager, shift the pager's
              // `start` rightwards. Unless it would go "too" rightwards,
              // in which case it will be at the right edge
              var delta = pageNumber - halfMaxPagesInPager;
              if( delta >= 1 ){
                if( delta + maxPagesInPager <= lengh )
                  start = delta;
                else
                  start = length - maxPagesInPager;
              }
            }

            // Only take the part of the array that is to be displayed
            pager = pager.splice( start, maxPagesInPager );

            var pagerData = {
              prevPageName: prevFileName,
              pageName: fileName,
              nextPageName: nextFileName,

              pageNumber: pageNumber,
              totalElemens: totalElements,
              totalPages: totalPages,
              elementsPerPage: elementsPerPage,
              elementsInThisPage: inPage,
              listName: valueName,
              pager: pager,
            };

            info.pagerData = pagerData;
            ryver.makeFileData( false, filePath, fileName + templateFileExt, listTemplateAsBuffer, info, true, function( err, fileData ){
              if( err ) return cb( err );

              ryver.vlog("Made fileData with:", filePath, fileName, templateFileExt, info );

              ryver.vlog("Resulting fileData:" );
              ryver.vlog( function(){
                ryver.vlog( ryver.trimFileData( fileData ) );
              });

              ryver.filter( fileData, function( err ){
                if( err ) return cb( err );

                // Increment the page number
                pageNumber++;
                cb( null );
              });
            });
          });
        },
        function( err ){
          if( err ) return cb( err );

          return cb( null );
        }
      );
    }
    // End of makeList

  });


};

// lister -- allDone to generate lists
eventEC.onCollect( 'allDone', function( cb ){

  var f = function( cb ){

    // If module is to be skipped, skip
    if( skipMe ) return cb( null );

    makeLists( null, cb );

  }
  // End of f()

  // Return the function just defined as the filter
  cb( null, { name: 'lister-filegen', executor: f } );
});
