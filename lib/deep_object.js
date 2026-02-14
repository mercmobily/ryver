'use strict';

function DeepObject( obj ){
  this._setObj( obj );
}

DeepObject.prototype._setObj = function( obj ){
  if( typeof obj === 'undefined' ){
    this.obj = {};
    return this.obj;
  }

  if( typeof obj !== 'object' || obj === null ){
    throw new Error("DeepObject initial value must be a non-null object");
  }

  this.obj = obj;
  return this.obj;
}

DeepObject.prototype.get = function( path, defaultValue ){
  if( typeof path === 'undefined' ) return this.obj;

  var current = this.obj;
  var parts = path.split('.');
  var i;

  for( i = 0; i < parts.length; i++ ){
    var part = parts[ i ];
    if( current !== null && typeof current === 'object' && part in current ){
      current = current[ part ];
    } else {
      return defaultValue;
    }
  }

  return current;
}

DeepObject.prototype.set = function( path, value ){
  if( typeof value === 'undefined' ){
    value = path;
    this._setObj( value );
    return value;
  }

  var current = this.obj;
  var parts = path.split('.');
  var i;

  for( i = 0; i < parts.length - 1; i++ ){
    var part = parts[ i ];
    if( typeof current[ part ] !== 'object' || current[ part ] === null ){
      current[ part ] = {};
    }
    current = current[ part ];
  }

  current[ parts[ parts.length - 1 ] ] = value;
  return value;
}

DeepObject.get = function( obj, path, defaultValue ){
  var o = new DeepObject( obj );
  return o.get( path, defaultValue );
}

DeepObject.set = function( obj, path, value ){
  var o = new DeepObject( obj );
  return o.set( path, value );
}

module.exports = DeepObject;
