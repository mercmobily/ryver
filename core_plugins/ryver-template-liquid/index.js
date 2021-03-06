
var ryver = require('ryver');
var liquid = require('tinyliquid');
var p = require('path');

var eventEC = ryver.eventEC;

eventEC.onCollect( 'filter', function( cb ){

  var f = function( fileData, cb ){

    // This filter will only work on text files (of any kind)
    if( fileData.system.mimetype.split('/')[0] !== 'text'){
      ryver.log( "File ignored as mime type is not 'text':", fileData.system.mimetype );
      return cb( null );
    }

    var render = liquid.compile( fileData.contents,
      {
        customTags: {
          say_hello: function (context, name, body) {
            // the first argument is the current parser context, different with tinyliquid.newContext()
            // the second argument is the current tag name, in this example is "say_hello"
            // the third argument is the tag content, in this example is "name"
            // use context.astStack.push(ast) to add the results to the AST tree
            // so we can convert the custom tag to the base tag template => Hello, {{name}}!
            // and use tinyliquid.parse() to get the results
            var ast = liquid.parse('Hello, ' + body.trim() + '! ');

            context.astStack.push(ast);
          }
        }
      }
    );

    var context = liquid.newContext ({
      locals : fileData,
    });

    // Define onInclude so that `include` works
    context.onInclude( function( fileNameAndExt, cb ){
      ryver.readFile( fileData.system.filePath, null, fileNameAndExt, function( err, includedAsBuffer ){
        if( err ) return cb( err );

        var included = includedAsBuffer.toString();
        var ast = liquid.parse( included );

        // Add the included file as a dependency to this one
        fileData.system.originDependencies.push( p.join( fileData.system.filePath, fileNameAndExt ) );

        cb( null, ast );
      });
    });

    // Render the file using the created context
    render( context, function( err ){
      if( err ) return cb( err );

      fileData.contents = context.getBuffer();
      cb( null );
    });
  }

  // Return the function just defined as the filter
  cb( null, { name: 'template-liquid', executor: f } );
});
