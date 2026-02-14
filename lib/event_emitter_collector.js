'use strict';

function enrichArray( results ){
  results.onlyResults = function(){
    var ret = [];
    this.forEach( function( item ){
      ret.push( item.result );
    });
    return ret;
  };

  results.groupByModule = function(){
    var ret = {};
    this.forEach( function( item ){
      if( !Array.isArray( ret[ item.module ] ) ) ret[ item.module ] = [];
      ret[ item.module ].push( item.result );
    });
    return ret;
  };

  return results;
}

function runSeries( tasks, done ){
  var i = 0;
  var results = [];

  function next( err, result ){
    if( err ) return done( err );

    if( i !== 0 ) results.push( result );

    if( i >= tasks.length ) return done( null, results );

    var task = tasks[ i++ ];
    task( next );
  }

  next();
}

function EventEmitterCollector(){
  this.listenersByModuleEvent = {};
  this.listenersByEvent = {};
}

EventEmitterCollector.prototype.addListenerCollect = function(){
  this.onCollect.apply( this, arguments );
}

EventEmitterCollector.prototype.onCollect = function( event, module, listener ){
  if( typeof module === 'function' ){
    listener = module;
    module = 'global';
  }

  if( typeof this.listenersByModuleEvent[ module ] === 'undefined' ){
    this.listenersByModuleEvent[ module ] = {};
  }
  if( !Array.isArray( this.listenersByModuleEvent[ module ][ event ] ) ){
    this.listenersByModuleEvent[ module ][ event ] = [];
  }
  if( !Array.isArray( this.listenersByEvent[ event ] ) ){
    this.listenersByEvent[ event ] = [];
  }

  this.listenersByModuleEvent[ module ][ event ].push( listener );
  this.listenersByEvent[ event ].push( { module: module, listener: listener } );
}

EventEmitterCollector.prototype.emitCollectModule = function(){
  var args = Array.prototype.slice.call( arguments );
  var event = args.shift();
  var module = args.shift();
  var callback = args.pop();
  var eventArguments = args;
  var self = this;

  if(
    typeof this.listenersByModuleEvent[ module ] === 'undefined' ||
    typeof this.listenersByModuleEvent[ module ][ event ] === 'undefined'
  ){
    return callback( null, enrichArray( [] ) );
  }

  var listeners = this.listenersByModuleEvent[ module ][ event ];
  var tasks = listeners.map( function( listener ){
    return function( done ){
      listener.apply( null, eventArguments.concat( function( err, res ){
        if( err ) return done( err );
        done( null, { module: module, result: res } );
      }));
    };
  });

  runSeries( tasks, function( err, results ){
    if( err ) return callback( err );
    callback( null, enrichArray( results ) );
  });
}

EventEmitterCollector.prototype.emitCollect = function(){
  var args = Array.prototype.slice.call( arguments );
  var event = args.shift();
  var callback = args.pop();
  var eventArguments = args;

  if( typeof this.listenersByEvent[ event ] === 'undefined' ){
    return callback( null, enrichArray( [] ) );
  }

  var listenerItems = this.listenersByEvent[ event ];
  var tasks = listenerItems.map( function( listenerItem ){
    return function( done ){
      listenerItem.listener.apply( null, eventArguments.concat( function( err, res ){
        if( err ) return done( err );
        done( null, { module: listenerItem.module, result: res } );
      }));
    };
  });

  runSeries( tasks, function( err, results ){
    if( err ) return callback( err );
    callback( null, enrichArray( results ) );
  });
}

module.exports = EventEmitterCollector;
