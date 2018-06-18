/*! bishop-ai-github-io - v0.3.0 - 2018-06-17 */
require=(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(function (process,setImmediate){
// vim:ts=4:sts=4:sw=4:
/*!
 *
 * Copyright 2009-2017 Kris Kowal under the terms of the MIT
 * license found at https://github.com/kriskowal/q/blob/v1/LICENSE
 *
 * With parts by Tyler Close
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 * Forked at ref_send.js version: 2009-05-11
 *
 * With parts by Mark Miller
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

(function (definition) {
    "use strict";

    // This file will function properly as a <script> tag, or a module
    // using CommonJS and NodeJS or RequireJS module formats.  In
    // Common/Node/RequireJS, the module exports the Q API and when
    // executed as a simple <script>, it creates a Q global instead.

    // Montage Require
    if (typeof bootstrap === "function") {
        bootstrap("promise", definition);

    // CommonJS
    } else if (typeof exports === "object" && typeof module === "object") {
        module.exports = definition();

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
        define(definition);

    // SES (Secure EcmaScript)
    } else if (typeof ses !== "undefined") {
        if (!ses.ok()) {
            return;
        } else {
            ses.makeQ = definition;
        }

    // <script>
    } else if (typeof window !== "undefined" || typeof self !== "undefined") {
        // Prefer window over self for add-on scripts. Use self for
        // non-windowed contexts.
        var global = typeof window !== "undefined" ? window : self;

        // Get the `window` object, save the previous Q global
        // and initialize Q as a global.
        var previousQ = global.Q;
        global.Q = definition();

        // Add a noConflict function so Q can be removed from the
        // global namespace.
        global.Q.noConflict = function () {
            global.Q = previousQ;
            return this;
        };

    } else {
        throw new Error("This environment was not anticipated by Q. Please file a bug.");
    }

})(function () {
"use strict";

var hasStacks = false;
try {
    throw new Error();
} catch (e) {
    hasStacks = !!e.stack;
}

// All code after this point will be filtered from stack traces reported
// by Q.
var qStartingLine = captureLine();
var qFileName;

// shims

// used for fallback in "allResolved"
var noop = function () {};

// Use the fastest possible means to execute a task in a future turn
// of the event loop.
var nextTick =(function () {
    // linked list of tasks (single, with head node)
    var head = {task: void 0, next: null};
    var tail = head;
    var flushing = false;
    var requestTick = void 0;
    var isNodeJS = false;
    // queue for late tasks, used by unhandled rejection tracking
    var laterQueue = [];

    function flush() {
        /* jshint loopfunc: true */
        var task, domain;

        while (head.next) {
            head = head.next;
            task = head.task;
            head.task = void 0;
            domain = head.domain;

            if (domain) {
                head.domain = void 0;
                domain.enter();
            }
            runSingle(task, domain);

        }
        while (laterQueue.length) {
            task = laterQueue.pop();
            runSingle(task);
        }
        flushing = false;
    }
    // runs a single function in the async queue
    function runSingle(task, domain) {
        try {
            task();

        } catch (e) {
            if (isNodeJS) {
                // In node, uncaught exceptions are considered fatal errors.
                // Re-throw them synchronously to interrupt flushing!

                // Ensure continuation if the uncaught exception is suppressed
                // listening "uncaughtException" events (as domains does).
                // Continue in next event to avoid tick recursion.
                if (domain) {
                    domain.exit();
                }
                setTimeout(flush, 0);
                if (domain) {
                    domain.enter();
                }

                throw e;

            } else {
                // In browsers, uncaught exceptions are not fatal.
                // Re-throw them asynchronously to avoid slow-downs.
                setTimeout(function () {
                    throw e;
                }, 0);
            }
        }

        if (domain) {
            domain.exit();
        }
    }

    nextTick = function (task) {
        tail = tail.next = {
            task: task,
            domain: isNodeJS && process.domain,
            next: null
        };

        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };

    if (typeof process === "object" &&
        process.toString() === "[object process]" && process.nextTick) {
        // Ensure Q is in a real Node environment, with a `process.nextTick`.
        // To see through fake Node environments:
        // * Mocha test runner - exposes a `process` global without a `nextTick`
        // * Browserify - exposes a `process.nexTick` function that uses
        //   `setTimeout`. In this case `setImmediate` is preferred because
        //    it is faster. Browserify's `process.toString()` yields
        //   "[object Object]", while in a real Node environment
        //   `process.toString()` yields "[object process]".
        isNodeJS = true;

        requestTick = function () {
            process.nextTick(flush);
        };

    } else if (typeof setImmediate === "function") {
        // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
        if (typeof window !== "undefined") {
            requestTick = setImmediate.bind(window, flush);
        } else {
            requestTick = function () {
                setImmediate(flush);
            };
        }

    } else if (typeof MessageChannel !== "undefined") {
        // modern browsers
        // http://www.nonblocking.io/2011/06/windownexttick.html
        var channel = new MessageChannel();
        // At least Safari Version 6.0.5 (8536.30.1) intermittently cannot create
        // working message ports the first time a page loads.
        channel.port1.onmessage = function () {
            requestTick = requestPortTick;
            channel.port1.onmessage = flush;
            flush();
        };
        var requestPortTick = function () {
            // Opera requires us to provide a message payload, regardless of
            // whether we use it.
            channel.port2.postMessage(0);
        };
        requestTick = function () {
            setTimeout(flush, 0);
            requestPortTick();
        };

    } else {
        // old browsers
        requestTick = function () {
            setTimeout(flush, 0);
        };
    }
    // runs a task after all other tasks have been run
    // this is useful for unhandled rejection tracking that needs to happen
    // after all `then`d tasks have been run.
    nextTick.runAfter = function (task) {
        laterQueue.push(task);
        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };
    return nextTick;
})();

// Attempt to make generics safe in the face of downstream
// modifications.
// There is no situation where this is necessary.
// If you need a security guarantee, these primordials need to be
// deeply frozen anyway, and if you don’t need a security guarantee,
// this is just plain paranoid.
// However, this **might** have the nice side-effect of reducing the size of
// the minified code by reducing x.call() to merely x()
// See Mark Miller’s explanation of what this does.
// http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
var call = Function.call;
function uncurryThis(f) {
    return function () {
        return call.apply(f, arguments);
    };
}
// This is equivalent, but slower:
// uncurryThis = Function_bind.bind(Function_bind.call);
// http://jsperf.com/uncurrythis

var array_slice = uncurryThis(Array.prototype.slice);

var array_reduce = uncurryThis(
    Array.prototype.reduce || function (callback, basis) {
        var index = 0,
            length = this.length;
        // concerning the initial value, if one is not provided
        if (arguments.length === 1) {
            // seek to the first value in the array, accounting
            // for the possibility that is is a sparse array
            do {
                if (index in this) {
                    basis = this[index++];
                    break;
                }
                if (++index >= length) {
                    throw new TypeError();
                }
            } while (1);
        }
        // reduce
        for (; index < length; index++) {
            // account for the possibility that the array is sparse
            if (index in this) {
                basis = callback(basis, this[index], index);
            }
        }
        return basis;
    }
);

var array_indexOf = uncurryThis(
    Array.prototype.indexOf || function (value) {
        // not a very good shim, but good enough for our one use of it
        for (var i = 0; i < this.length; i++) {
            if (this[i] === value) {
                return i;
            }
        }
        return -1;
    }
);

var array_map = uncurryThis(
    Array.prototype.map || function (callback, thisp) {
        var self = this;
        var collect = [];
        array_reduce(self, function (undefined, value, index) {
            collect.push(callback.call(thisp, value, index, self));
        }, void 0);
        return collect;
    }
);

var object_create = Object.create || function (prototype) {
    function Type() { }
    Type.prototype = prototype;
    return new Type();
};

var object_defineProperty = Object.defineProperty || function (obj, prop, descriptor) {
    obj[prop] = descriptor.value;
    return obj;
};

var object_hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

var object_keys = Object.keys || function (object) {
    var keys = [];
    for (var key in object) {
        if (object_hasOwnProperty(object, key)) {
            keys.push(key);
        }
    }
    return keys;
};

var object_toString = uncurryThis(Object.prototype.toString);

function isObject(value) {
    return value === Object(value);
}

// generator related shims

// FIXME: Remove this function once ES6 generators are in SpiderMonkey.
function isStopIteration(exception) {
    return (
        object_toString(exception) === "[object StopIteration]" ||
        exception instanceof QReturnValue
    );
}

// FIXME: Remove this helper and Q.return once ES6 generators are in
// SpiderMonkey.
var QReturnValue;
if (typeof ReturnValue !== "undefined") {
    QReturnValue = ReturnValue;
} else {
    QReturnValue = function (value) {
        this.value = value;
    };
}

// long stack traces

var STACK_JUMP_SEPARATOR = "From previous event:";

function makeStackTraceLong(error, promise) {
    // If possible, transform the error stack trace by removing Node and Q
    // cruft, then concatenating with the stack trace of `promise`. See #57.
    if (hasStacks &&
        promise.stack &&
        typeof error === "object" &&
        error !== null &&
        error.stack
    ) {
        var stacks = [];
        for (var p = promise; !!p; p = p.source) {
            if (p.stack && (!error.__minimumStackCounter__ || error.__minimumStackCounter__ > p.stackCounter)) {
                object_defineProperty(error, "__minimumStackCounter__", {value: p.stackCounter, configurable: true});
                stacks.unshift(p.stack);
            }
        }
        stacks.unshift(error.stack);

        var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
        var stack = filterStackString(concatedStacks);
        object_defineProperty(error, "stack", {value: stack, configurable: true});
    }
}

function filterStackString(stackString) {
    var lines = stackString.split("\n");
    var desiredLines = [];
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];

        if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
            desiredLines.push(line);
        }
    }
    return desiredLines.join("\n");
}

function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
           stackLine.indexOf("(node.js:") !== -1;
}

function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    // In IE10 function name can have spaces ("Anonymous function") O_o
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) {
        return [attempt1[1], Number(attempt1[2])];
    }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) {
        return [attempt2[1], Number(attempt2[2])];
    }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) {
        return [attempt3[1], Number(attempt3[2])];
    }
}

function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);

    if (!fileNameAndLineNumber) {
        return false;
    }

    var fileName = fileNameAndLineNumber[0];
    var lineNumber = fileNameAndLineNumber[1];

    return fileName === qFileName &&
        lineNumber >= qStartingLine &&
        lineNumber <= qEndingLine;
}

// discover own file name and line number range for filtering stack
// traces
function captureLine() {
    if (!hasStacks) {
        return;
    }

    try {
        throw new Error();
    } catch (e) {
        var lines = e.stack.split("\n");
        var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
        var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
        if (!fileNameAndLineNumber) {
            return;
        }

        qFileName = fileNameAndLineNumber[0];
        return fileNameAndLineNumber[1];
    }
}

function deprecate(callback, name, alternative) {
    return function () {
        if (typeof console !== "undefined" &&
            typeof console.warn === "function") {
            console.warn(name + " is deprecated, use " + alternative +
                         " instead.", new Error("").stack);
        }
        return callback.apply(callback, arguments);
    };
}

// end of shims
// beginning of real work

/**
 * Constructs a promise for an immediate reference, passes promises through, or
 * coerces promises from different systems.
 * @param value immediate reference or promise
 */
function Q(value) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (value instanceof Promise) {
        return value;
    }

    // assimilate thenables
    if (isPromiseAlike(value)) {
        return coerce(value);
    } else {
        return fulfill(value);
    }
}
Q.resolve = Q;

/**
 * Performs a task in a future turn of the event loop.
 * @param {Function} task
 */
Q.nextTick = nextTick;

/**
 * Controls whether or not long stack traces will be on
 */
Q.longStackSupport = false;

/**
 * The counter is used to determine the stopping point for building
 * long stack traces. In makeStackTraceLong we walk backwards through
 * the linked list of promises, only stacks which were created before
 * the rejection are concatenated.
 */
var longStackCounter = 1;

// enable long stacks if Q_DEBUG is set
if (typeof process === "object" && process && process.env && process.env.Q_DEBUG) {
    Q.longStackSupport = true;
}

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 */
Q.defer = defer;
function defer() {
    // if "messages" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the messages array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the `resolve` function because it handles both fully
    // non-thenable values and other thenables gracefully.
    var messages = [], progressListeners = [], resolvedPromise;

    var deferred = object_create(defer.prototype);
    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, operands) {
        var args = array_slice(arguments);
        if (messages) {
            messages.push(args);
            if (op === "when" && operands[1]) { // progress operand
                progressListeners.push(operands[1]);
            }
        } else {
            Q.nextTick(function () {
                resolvedPromise.promiseDispatch.apply(resolvedPromise, args);
            });
        }
    };

    // XXX deprecated
    promise.valueOf = function () {
        if (messages) {
            return promise;
        }
        var nearerValue = nearer(resolvedPromise);
        if (isPromise(nearerValue)) {
            resolvedPromise = nearerValue; // shorten chain
        }
        return nearerValue;
    };

    promise.inspect = function () {
        if (!resolvedPromise) {
            return { state: "pending" };
        }
        return resolvedPromise.inspect();
    };

    if (Q.longStackSupport && hasStacks) {
        try {
            throw new Error();
        } catch (e) {
            // NOTE: don't try to use `Error.captureStackTrace` or transfer the
            // accessor around; that causes memory leaks as per GH-111. Just
            // reify the stack trace as a string ASAP.
            //
            // At the same time, cut off the first line; it's always just
            // "[object Promise]\n", as per the `toString`.
            promise.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
            promise.stackCounter = longStackCounter++;
        }
    }

    // NOTE: we do the checks for `resolvedPromise` in each method, instead of
    // consolidating them into `become`, since otherwise we'd create new
    // promises with the lines `become(whatever(value))`. See e.g. GH-252.

    function become(newPromise) {
        resolvedPromise = newPromise;

        if (Q.longStackSupport && hasStacks) {
            // Only hold a reference to the new promise if long stacks
            // are enabled to reduce memory usage
            promise.source = newPromise;
        }

        array_reduce(messages, function (undefined, message) {
            Q.nextTick(function () {
                newPromise.promiseDispatch.apply(newPromise, message);
            });
        }, void 0);

        messages = void 0;
        progressListeners = void 0;
    }

    deferred.promise = promise;
    deferred.resolve = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(Q(value));
    };

    deferred.fulfill = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(fulfill(value));
    };
    deferred.reject = function (reason) {
        if (resolvedPromise) {
            return;
        }

        become(reject(reason));
    };
    deferred.notify = function (progress) {
        if (resolvedPromise) {
            return;
        }

        array_reduce(progressListeners, function (undefined, progressListener) {
            Q.nextTick(function () {
                progressListener(progress);
            });
        }, void 0);
    };

    return deferred;
}

/**
 * Creates a Node-style callback that will resolve or reject the deferred
 * promise.
 * @returns a nodeback
 */
defer.prototype.makeNodeResolver = function () {
    var self = this;
    return function (error, value) {
        if (error) {
            self.reject(error);
        } else if (arguments.length > 2) {
            self.resolve(array_slice(arguments, 1));
        } else {
            self.resolve(value);
        }
    };
};

/**
 * @param resolver {Function} a function that returns nothing and accepts
 * the resolve, reject, and notify functions for a deferred.
 * @returns a promise that may be resolved with the given resolve and reject
 * functions, or rejected by a thrown exception in resolver
 */
Q.Promise = promise; // ES6
Q.promise = promise;
function promise(resolver) {
    if (typeof resolver !== "function") {
        throw new TypeError("resolver must be a function.");
    }
    var deferred = defer();
    try {
        resolver(deferred.resolve, deferred.reject, deferred.notify);
    } catch (reason) {
        deferred.reject(reason);
    }
    return deferred.promise;
}

promise.race = race; // ES6
promise.all = all; // ES6
promise.reject = reject; // ES6
promise.resolve = Q; // ES6

// XXX experimental.  This method is a way to denote that a local value is
// serializable and should be immediately dispatched to a remote upon request,
// instead of passing a reference.
Q.passByCopy = function (object) {
    //freeze(object);
    //passByCopies.set(object, true);
    return object;
};

Promise.prototype.passByCopy = function () {
    //freeze(object);
    //passByCopies.set(object, true);
    return this;
};

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Q.join = function (x, y) {
    return Q(x).join(y);
};

Promise.prototype.join = function (that) {
    return Q([this, that]).spread(function (x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Q can't join: not the same: " + x + " " + y);
        }
    });
};

/**
 * Returns a promise for the first of an array of promises to become settled.
 * @param answers {Array[Any*]} promises to race
 * @returns {Any*} the first promise to be settled
 */
Q.race = race;
function race(answerPs) {
    return promise(function (resolve, reject) {
        // Switch to this once we can assume at least ES5
        // answerPs.forEach(function (answerP) {
        //     Q(answerP).then(resolve, reject);
        // });
        // Use this in the meantime
        for (var i = 0, len = answerPs.length; i < len; i++) {
            Q(answerPs[i]).then(resolve, reject);
        }
    });
}

Promise.prototype.race = function () {
    return this.then(Q.race);
};

/**
 * Constructs a Promise with a promise descriptor object and optional fallback
 * function.  The descriptor contains methods like when(rejected), get(name),
 * set(name, value), post(name, args), and delete(name), which all
 * return either a value, a promise for a value, or a rejection.  The fallback
 * accepts the operation name, a resolver, and any further arguments that would
 * have been forwarded to the appropriate method above had a method been
 * provided with the proper name.  The API makes no guarantees about the nature
 * of the returned object, apart from that it is usable whereever promises are
 * bought and sold.
 */
Q.makePromise = Promise;
function Promise(descriptor, fallback, inspect) {
    if (fallback === void 0) {
        fallback = function (op) {
            return reject(new Error(
                "Promise does not support operation: " + op
            ));
        };
    }
    if (inspect === void 0) {
        inspect = function () {
            return {state: "unknown"};
        };
    }

    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, args) {
        var result;
        try {
            if (descriptor[op]) {
                result = descriptor[op].apply(promise, args);
            } else {
                result = fallback.call(promise, op, args);
            }
        } catch (exception) {
            result = reject(exception);
        }
        if (resolve) {
            resolve(result);
        }
    };

    promise.inspect = inspect;

    // XXX deprecated `valueOf` and `exception` support
    if (inspect) {
        var inspected = inspect();
        if (inspected.state === "rejected") {
            promise.exception = inspected.reason;
        }

        promise.valueOf = function () {
            var inspected = inspect();
            if (inspected.state === "pending" ||
                inspected.state === "rejected") {
                return promise;
            }
            return inspected.value;
        };
    }

    return promise;
}

Promise.prototype.toString = function () {
    return "[object Promise]";
};

Promise.prototype.then = function (fulfilled, rejected, progressed) {
    var self = this;
    var deferred = defer();
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks

    function _fulfilled(value) {
        try {
            return typeof fulfilled === "function" ? fulfilled(value) : value;
        } catch (exception) {
            return reject(exception);
        }
    }

    function _rejected(exception) {
        if (typeof rejected === "function") {
            makeStackTraceLong(exception, self);
            try {
                return rejected(exception);
            } catch (newException) {
                return reject(newException);
            }
        }
        return reject(exception);
    }

    function _progressed(value) {
        return typeof progressed === "function" ? progressed(value) : value;
    }

    Q.nextTick(function () {
        self.promiseDispatch(function (value) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_fulfilled(value));
        }, "when", [function (exception) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_rejected(exception));
        }]);
    });

    // Progress propagator need to be attached in the current tick.
    self.promiseDispatch(void 0, "when", [void 0, function (value) {
        var newValue;
        var threw = false;
        try {
            newValue = _progressed(value);
        } catch (e) {
            threw = true;
            if (Q.onerror) {
                Q.onerror(e);
            } else {
                throw e;
            }
        }

        if (!threw) {
            deferred.notify(newValue);
        }
    }]);

    return deferred.promise;
};

Q.tap = function (promise, callback) {
    return Q(promise).tap(callback);
};

/**
 * Works almost like "finally", but not called for rejections.
 * Original resolution value is passed through callback unaffected.
 * Callback may return a promise that will be awaited for.
 * @param {Function} callback
 * @returns {Q.Promise}
 * @example
 * doSomething()
 *   .then(...)
 *   .tap(console.log)
 *   .then(...);
 */
Promise.prototype.tap = function (callback) {
    callback = Q(callback);

    return this.then(function (value) {
        return callback.fcall(value).thenResolve(value);
    });
};

/**
 * Registers an observer on a promise.
 *
 * Guarantees:
 *
 * 1. that fulfilled and rejected will be called only once.
 * 2. that either the fulfilled callback or the rejected callback will be
 *    called, but not both.
 * 3. that fulfilled and rejected will not be called in this turn.
 *
 * @param value      promise or immediate reference to observe
 * @param fulfilled  function to be called with the fulfilled value
 * @param rejected   function to be called with the rejection exception
 * @param progressed function to be called on any progress notifications
 * @return promise for the return value from the invoked callback
 */
Q.when = when;
function when(value, fulfilled, rejected, progressed) {
    return Q(value).then(fulfilled, rejected, progressed);
}

Promise.prototype.thenResolve = function (value) {
    return this.then(function () { return value; });
};

Q.thenResolve = function (promise, value) {
    return Q(promise).thenResolve(value);
};

Promise.prototype.thenReject = function (reason) {
    return this.then(function () { throw reason; });
};

Q.thenReject = function (promise, reason) {
    return Q(promise).thenReject(reason);
};

/**
 * If an object is not a promise, it is as "near" as possible.
 * If a promise is rejected, it is as "near" as possible too.
 * If it’s a fulfilled promise, the fulfillment value is nearer.
 * If it’s a deferred promise and the deferred has been resolved, the
 * resolution is "nearer".
 * @param object
 * @returns most resolved (nearest) form of the object
 */

// XXX should we re-do this?
Q.nearer = nearer;
function nearer(value) {
    if (isPromise(value)) {
        var inspected = value.inspect();
        if (inspected.state === "fulfilled") {
            return inspected.value;
        }
    }
    return value;
}

/**
 * @returns whether the given object is a promise.
 * Otherwise it is a fulfilled value.
 */
Q.isPromise = isPromise;
function isPromise(object) {
    return object instanceof Promise;
}

Q.isPromiseAlike = isPromiseAlike;
function isPromiseAlike(object) {
    return isObject(object) && typeof object.then === "function";
}

/**
 * @returns whether the given object is a pending promise, meaning not
 * fulfilled or rejected.
 */
Q.isPending = isPending;
function isPending(object) {
    return isPromise(object) && object.inspect().state === "pending";
}

Promise.prototype.isPending = function () {
    return this.inspect().state === "pending";
};

/**
 * @returns whether the given object is a value or fulfilled
 * promise.
 */
Q.isFulfilled = isFulfilled;
function isFulfilled(object) {
    return !isPromise(object) || object.inspect().state === "fulfilled";
}

Promise.prototype.isFulfilled = function () {
    return this.inspect().state === "fulfilled";
};

/**
 * @returns whether the given object is a rejected promise.
 */
Q.isRejected = isRejected;
function isRejected(object) {
    return isPromise(object) && object.inspect().state === "rejected";
}

Promise.prototype.isRejected = function () {
    return this.inspect().state === "rejected";
};

//// BEGIN UNHANDLED REJECTION TRACKING

// This promise library consumes exceptions thrown in handlers so they can be
// handled by a subsequent promise.  The exceptions get added to this array when
// they are created, and removed when they are handled.  Note that in ES6 or
// shimmed environments, this would naturally be a `Set`.
var unhandledReasons = [];
var unhandledRejections = [];
var reportedUnhandledRejections = [];
var trackUnhandledRejections = true;

function resetUnhandledRejections() {
    unhandledReasons.length = 0;
    unhandledRejections.length = 0;

    if (!trackUnhandledRejections) {
        trackUnhandledRejections = true;
    }
}

function trackRejection(promise, reason) {
    if (!trackUnhandledRejections) {
        return;
    }
    if (typeof process === "object" && typeof process.emit === "function") {
        Q.nextTick.runAfter(function () {
            if (array_indexOf(unhandledRejections, promise) !== -1) {
                process.emit("unhandledRejection", reason, promise);
                reportedUnhandledRejections.push(promise);
            }
        });
    }

    unhandledRejections.push(promise);
    if (reason && typeof reason.stack !== "undefined") {
        unhandledReasons.push(reason.stack);
    } else {
        unhandledReasons.push("(no stack) " + reason);
    }
}

function untrackRejection(promise) {
    if (!trackUnhandledRejections) {
        return;
    }

    var at = array_indexOf(unhandledRejections, promise);
    if (at !== -1) {
        if (typeof process === "object" && typeof process.emit === "function") {
            Q.nextTick.runAfter(function () {
                var atReport = array_indexOf(reportedUnhandledRejections, promise);
                if (atReport !== -1) {
                    process.emit("rejectionHandled", unhandledReasons[at], promise);
                    reportedUnhandledRejections.splice(atReport, 1);
                }
            });
        }
        unhandledRejections.splice(at, 1);
        unhandledReasons.splice(at, 1);
    }
}

Q.resetUnhandledRejections = resetUnhandledRejections;

Q.getUnhandledReasons = function () {
    // Make a copy so that consumers can't interfere with our internal state.
    return unhandledReasons.slice();
};

Q.stopUnhandledRejectionTracking = function () {
    resetUnhandledRejections();
    trackUnhandledRejections = false;
};

resetUnhandledRejections();

//// END UNHANDLED REJECTION TRACKING

/**
 * Constructs a rejected promise.
 * @param reason value describing the failure
 */
Q.reject = reject;
function reject(reason) {
    var rejection = Promise({
        "when": function (rejected) {
            // note that the error has been handled
            if (rejected) {
                untrackRejection(this);
            }
            return rejected ? rejected(reason) : this;
        }
    }, function fallback() {
        return this;
    }, function inspect() {
        return { state: "rejected", reason: reason };
    });

    // Note that the reason has not been handled.
    trackRejection(rejection, reason);

    return rejection;
}

/**
 * Constructs a fulfilled promise for an immediate reference.
 * @param value immediate reference
 */
Q.fulfill = fulfill;
function fulfill(value) {
    return Promise({
        "when": function () {
            return value;
        },
        "get": function (name) {
            return value[name];
        },
        "set": function (name, rhs) {
            value[name] = rhs;
        },
        "delete": function (name) {
            delete value[name];
        },
        "post": function (name, args) {
            // Mark Miller proposes that post with no name should apply a
            // promised function.
            if (name === null || name === void 0) {
                return value.apply(void 0, args);
            } else {
                return value[name].apply(value, args);
            }
        },
        "apply": function (thisp, args) {
            return value.apply(thisp, args);
        },
        "keys": function () {
            return object_keys(value);
        }
    }, void 0, function inspect() {
        return { state: "fulfilled", value: value };
    });
}

/**
 * Converts thenables to Q promises.
 * @param promise thenable promise
 * @returns a Q promise
 */
function coerce(promise) {
    var deferred = defer();
    Q.nextTick(function () {
        try {
            promise.then(deferred.resolve, deferred.reject, deferred.notify);
        } catch (exception) {
            deferred.reject(exception);
        }
    });
    return deferred.promise;
}

/**
 * Annotates an object such that it will never be
 * transferred away from this process over any promise
 * communication channel.
 * @param object
 * @returns promise a wrapping of that object that
 * additionally responds to the "isDef" message
 * without a rejection.
 */
Q.master = master;
function master(object) {
    return Promise({
        "isDef": function () {}
    }, function fallback(op, args) {
        return dispatch(object, op, args);
    }, function () {
        return Q(object).inspect();
    });
}

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
Q.spread = spread;
function spread(value, fulfilled, rejected) {
    return Q(value).spread(fulfilled, rejected);
}

Promise.prototype.spread = function (fulfilled, rejected) {
    return this.all().then(function (array) {
        return fulfilled.apply(void 0, array);
    }, rejected);
};

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators.  Although generators are only part
 * of the newest ECMAScript 6 drafts, this code does not cause syntax
 * errors in older engines.  This code should continue to work and will
 * in fact improve over time as the language improves.
 *
 * ES6 generators are currently part of V8 version 3.19 with the
 * --harmony-generators runtime flag enabled.  SpiderMonkey has had them
 * for longer, but under an older Python-inspired form.  This function
 * works on both kinds of generators.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 */
Q.async = async;
function async(makeGenerator) {
    return function () {
        // when verb is "send", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var result;

            // Until V8 3.19 / Chromium 29 is released, SpiderMonkey is the only
            // engine that has a deployed base of browsers that support generators.
            // However, SM's generators use the Python-inspired semantics of
            // outdated ES6 drafts.  We would like to support ES6, but we'd also
            // like to make it possible to use generators in deployed browsers, so
            // we also support Python-style generators.  At some point we can remove
            // this block.

            if (typeof StopIteration === "undefined") {
                // ES6 Generators
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    return reject(exception);
                }
                if (result.done) {
                    return Q(result.value);
                } else {
                    return when(result.value, callback, errback);
                }
            } else {
                // SpiderMonkey Generators
                // FIXME: Remove this case when SM does ES6 generators.
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    if (isStopIteration(exception)) {
                        return Q(exception.value);
                    } else {
                        return reject(exception);
                    }
                }
                return when(result, callback, errback);
            }
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "next");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * The spawn function is a small wrapper around async that immediately
 * calls the generator and also ends the promise chain, so that any
 * unhandled errors are thrown instead of forwarded to the error
 * handler. This is useful because it's extremely common to run
 * generators at the top-level to work with libraries.
 */
Q.spawn = spawn;
function spawn(makeGenerator) {
    Q.done(Q.async(makeGenerator)());
}

// FIXME: Remove this interface once ES6 generators are in SpiderMonkey.
/**
 * Throws a ReturnValue exception to stop an asynchronous generator.
 *
 * This interface is a stop-gap measure to support generator return
 * values in older Firefox/SpiderMonkey.  In browsers that support ES6
 * generators like Chromium 29, just use "return" in your generator
 * functions.
 *
 * @param value the return value for the surrounding generator
 * @throws ReturnValue exception with the value.
 * @example
 * // ES6 style
 * Q.async(function* () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      return foo + bar;
 * })
 * // Older SpiderMonkey style
 * Q.async(function () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      Q.return(foo + bar);
 * })
 */
Q["return"] = _return;
function _return(value) {
    throw new QReturnValue(value);
}

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q(a), Q(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Q.promised = promised;
function promised(callback) {
    return function () {
        return spread([this, all(arguments)], function (self, args) {
            return callback.apply(self, args);
        });
    };
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
Q.dispatch = dispatch;
function dispatch(object, op, args) {
    return Q(object).dispatch(op, args);
}

Promise.prototype.dispatch = function (op, args) {
    var self = this;
    var deferred = defer();
    Q.nextTick(function () {
        self.promiseDispatch(deferred.resolve, op, args);
    });
    return deferred.promise;
};

/**
 * Gets the value of a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to get
 * @return promise for the property value
 */
Q.get = function (object, key) {
    return Q(object).dispatch("get", [key]);
};

Promise.prototype.get = function (key) {
    return this.dispatch("get", [key]);
};

/**
 * Sets the value of a property in a future turn.
 * @param object    promise or immediate reference for object object
 * @param name      name of property to set
 * @param value     new value of property
 * @return promise for the return value
 */
Q.set = function (object, key, value) {
    return Q(object).dispatch("set", [key, value]);
};

Promise.prototype.set = function (key, value) {
    return this.dispatch("set", [key, value]);
};

/**
 * Deletes a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to delete
 * @return promise for the return value
 */
Q.del = // XXX legacy
Q["delete"] = function (object, key) {
    return Q(object).dispatch("delete", [key]);
};

Promise.prototype.del = // XXX legacy
Promise.prototype["delete"] = function (key) {
    return this.dispatch("delete", [key]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param value     a value to post, typically an array of
 *                  invocation arguments for promises that
 *                  are ultimately backed with `resolve` values,
 *                  as opposed to those backed with URLs
 *                  wherein the posted value can be any
 *                  JSON serializable object.
 * @return promise for the return value
 */
// bound locally because it is used by other methods
Q.mapply = // XXX As proposed by "Redsandro"
Q.post = function (object, name, args) {
    return Q(object).dispatch("post", [name, args]);
};

Promise.prototype.mapply = // XXX As proposed by "Redsandro"
Promise.prototype.post = function (name, args) {
    return this.dispatch("post", [name, args]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param ...args   array of invocation arguments
 * @return promise for the return value
 */
Q.send = // XXX Mark Miller's proposed parlance
Q.mcall = // XXX As proposed by "Redsandro"
Q.invoke = function (object, name /*...args*/) {
    return Q(object).dispatch("post", [name, array_slice(arguments, 2)]);
};

Promise.prototype.send = // XXX Mark Miller's proposed parlance
Promise.prototype.mcall = // XXX As proposed by "Redsandro"
Promise.prototype.invoke = function (name /*...args*/) {
    return this.dispatch("post", [name, array_slice(arguments, 1)]);
};

/**
 * Applies the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param args      array of application arguments
 */
Q.fapply = function (object, args) {
    return Q(object).dispatch("apply", [void 0, args]);
};

Promise.prototype.fapply = function (args) {
    return this.dispatch("apply", [void 0, args]);
};

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q["try"] =
Q.fcall = function (object /* ...args*/) {
    return Q(object).dispatch("apply", [void 0, array_slice(arguments, 1)]);
};

Promise.prototype.fcall = function (/*...args*/) {
    return this.dispatch("apply", [void 0, array_slice(arguments)]);
};

/**
 * Binds the promised function, transforming return values into a fulfilled
 * promise and thrown errors into a rejected one.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q.fbind = function (object /*...args*/) {
    var promise = Q(object);
    var args = array_slice(arguments, 1);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};
Promise.prototype.fbind = function (/*...args*/) {
    var promise = this;
    var args = array_slice(arguments);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};

/**
 * Requests the names of the owned properties of a promised
 * object in a future turn.
 * @param object    promise or immediate reference for target object
 * @return promise for the keys of the eventually settled object
 */
Q.keys = function (object) {
    return Q(object).dispatch("keys", []);
};

Promise.prototype.keys = function () {
    return this.dispatch("keys", []);
};

/**
 * Turns an array of promises into a promise for an array.  If any of
 * the promises gets rejected, the whole array is rejected immediately.
 * @param {Array*} an array (or promise for an array) of values (or
 * promises for values)
 * @returns a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
Q.all = all;
function all(promises) {
    return when(promises, function (promises) {
        var pendingCount = 0;
        var deferred = defer();
        array_reduce(promises, function (undefined, promise, index) {
            var snapshot;
            if (
                isPromise(promise) &&
                (snapshot = promise.inspect()).state === "fulfilled"
            ) {
                promises[index] = snapshot.value;
            } else {
                ++pendingCount;
                when(
                    promise,
                    function (value) {
                        promises[index] = value;
                        if (--pendingCount === 0) {
                            deferred.resolve(promises);
                        }
                    },
                    deferred.reject,
                    function (progress) {
                        deferred.notify({ index: index, value: progress });
                    }
                );
            }
        }, void 0);
        if (pendingCount === 0) {
            deferred.resolve(promises);
        }
        return deferred.promise;
    });
}

Promise.prototype.all = function () {
    return all(this);
};

/**
 * Returns the first resolved promise of an array. Prior rejected promises are
 * ignored.  Rejects only if all promises are rejected.
 * @param {Array*} an array containing values or promises for values
 * @returns a promise fulfilled with the value of the first resolved promise,
 * or a rejected promise if all promises are rejected.
 */
Q.any = any;

function any(promises) {
    if (promises.length === 0) {
        return Q.resolve();
    }

    var deferred = Q.defer();
    var pendingCount = 0;
    array_reduce(promises, function (prev, current, index) {
        var promise = promises[index];

        pendingCount++;

        when(promise, onFulfilled, onRejected, onProgress);
        function onFulfilled(result) {
            deferred.resolve(result);
        }
        function onRejected(err) {
            pendingCount--;
            if (pendingCount === 0) {
                var rejection = err || new Error("" + err);

                rejection.message = ("Q can't get fulfillment value from any promise, all " +
                    "promises were rejected. Last error message: " + rejection.message);

                deferred.reject(rejection);
            }
        }
        function onProgress(progress) {
            deferred.notify({
                index: index,
                value: progress
            });
        }
    }, undefined);

    return deferred.promise;
}

Promise.prototype.any = function () {
    return any(this);
};

/**
 * Waits for all promises to be settled, either fulfilled or
 * rejected.  This is distinct from `all` since that would stop
 * waiting at the first rejection.  The promise returned by
 * `allResolved` will never be rejected.
 * @param promises a promise for an array (or an array) of promises
 * (or values)
 * @return a promise for an array of promises
 */
Q.allResolved = deprecate(allResolved, "allResolved", "allSettled");
function allResolved(promises) {
    return when(promises, function (promises) {
        promises = array_map(promises, Q);
        return when(all(array_map(promises, function (promise) {
            return when(promise, noop, noop);
        })), function () {
            return promises;
        });
    });
}

Promise.prototype.allResolved = function () {
    return allResolved(this);
};

/**
 * @see Promise#allSettled
 */
Q.allSettled = allSettled;
function allSettled(promises) {
    return Q(promises).allSettled();
}

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function () {
    return this.then(function (promises) {
        return all(array_map(promises, function (promise) {
            promise = Q(promise);
            function regardless() {
                return promise.inspect();
            }
            return promise.then(regardless, regardless);
        }));
    });
};

/**
 * Captures the failure of a promise, giving an oportunity to recover
 * with a callback.  If the given promise is fulfilled, the returned
 * promise is fulfilled.
 * @param {Any*} promise for something
 * @param {Function} callback to fulfill the returned promise if the
 * given promise is rejected
 * @returns a promise for the return value of the callback
 */
Q.fail = // XXX legacy
Q["catch"] = function (object, rejected) {
    return Q(object).then(void 0, rejected);
};

Promise.prototype.fail = // XXX legacy
Promise.prototype["catch"] = function (rejected) {
    return this.then(void 0, rejected);
};

/**
 * Attaches a listener that can respond to progress notifications from a
 * promise's originating deferred. This listener receives the exact arguments
 * passed to ``deferred.notify``.
 * @param {Any*} promise for something
 * @param {Function} callback to receive any progress notifications
 * @returns the given promise, unchanged
 */
Q.progress = progress;
function progress(object, progressed) {
    return Q(object).then(void 0, void 0, progressed);
}

Promise.prototype.progress = function (progressed) {
    return this.then(void 0, void 0, progressed);
};

/**
 * Provides an opportunity to observe the settling of a promise,
 * regardless of whether the promise is fulfilled or rejected.  Forwards
 * the resolution to the returned promise when the callback is done.
 * The callback can return a promise to defer completion.
 * @param {Any*} promise
 * @param {Function} callback to observe the resolution of the given
 * promise, takes no arguments.
 * @returns a promise for the resolution of the given promise when
 * ``fin`` is done.
 */
Q.fin = // XXX legacy
Q["finally"] = function (object, callback) {
    return Q(object)["finally"](callback);
};

Promise.prototype.fin = // XXX legacy
Promise.prototype["finally"] = function (callback) {
    if (!callback || typeof callback.apply !== "function") {
        throw new Error("Q can't apply finally callback");
    }
    callback = Q(callback);
    return this.then(function (value) {
        return callback.fcall().then(function () {
            return value;
        });
    }, function (reason) {
        // TODO attempt to recycle the rejection with "this".
        return callback.fcall().then(function () {
            throw reason;
        });
    });
};

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param {Any*} promise at the end of a chain of promises
 * @returns nothing
 */
Q.done = function (object, fulfilled, rejected, progress) {
    return Q(object).done(fulfilled, rejected, progress);
};

Promise.prototype.done = function (fulfilled, rejected, progress) {
    var onUnhandledError = function (error) {
        // forward to a future turn so that ``when``
        // does not catch it and turn it into a rejection.
        Q.nextTick(function () {
            makeStackTraceLong(error, promise);
            if (Q.onerror) {
                Q.onerror(error);
            } else {
                throw error;
            }
        });
    };

    // Avoid unnecessary `nextTick`ing via an unnecessary `when`.
    var promise = fulfilled || rejected || progress ?
        this.then(fulfilled, rejected, progress) :
        this;

    if (typeof process === "object" && process && process.domain) {
        onUnhandledError = process.domain.bind(onUnhandledError);
    }

    promise.then(void 0, onUnhandledError);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {Any*} custom error message or Error object (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Q.timeout = function (object, ms, error) {
    return Q(object).timeout(ms, error);
};

Promise.prototype.timeout = function (ms, error) {
    var deferred = defer();
    var timeoutId = setTimeout(function () {
        if (!error || "string" === typeof error) {
            error = new Error(error || "Timed out after " + ms + " ms");
            error.code = "ETIMEDOUT";
        }
        deferred.reject(error);
    }, ms);

    this.then(function (value) {
        clearTimeout(timeoutId);
        deferred.resolve(value);
    }, function (exception) {
        clearTimeout(timeoutId);
        deferred.reject(exception);
    }, deferred.notify);

    return deferred.promise;
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Q.delay = function (object, timeout) {
    if (timeout === void 0) {
        timeout = object;
        object = void 0;
    }
    return Q(object).delay(timeout);
};

Promise.prototype.delay = function (timeout) {
    return this.then(function (value) {
        var deferred = defer();
        setTimeout(function () {
            deferred.resolve(value);
        }, timeout);
        return deferred.promise;
    });
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided as an array, and returns a promise.
 *
 *      Q.nfapply(FS.readFile, [__filename])
 *      .then(function (content) {
 *      })
 *
 */
Q.nfapply = function (callback, args) {
    return Q(callback).nfapply(args);
};

Promise.prototype.nfapply = function (args) {
    var deferred = defer();
    var nodeArgs = array_slice(args);
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided individually, and returns a promise.
 * @example
 * Q.nfcall(FS.readFile, __filename)
 * .then(function (content) {
 * })
 *
 */
Q.nfcall = function (callback /*...args*/) {
    var args = array_slice(arguments, 1);
    return Q(callback).nfapply(args);
};

Promise.prototype.nfcall = function (/*...args*/) {
    var nodeArgs = array_slice(arguments);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Wraps a NodeJS continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Q.nfbind(FS.readFile, __filename)("utf-8")
 * .then(console.log)
 * .done()
 */
Q.nfbind =
Q.denodeify = function (callback /*...args*/) {
    if (callback === undefined) {
        throw new Error("Q can't wrap an undefined function");
    }
    var baseArgs = array_slice(arguments, 1);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        Q(callback).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nfbind =
Promise.prototype.denodeify = function (/*...args*/) {
    var args = array_slice(arguments);
    args.unshift(this);
    return Q.denodeify.apply(void 0, args);
};

Q.nbind = function (callback, thisp /*...args*/) {
    var baseArgs = array_slice(arguments, 2);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        function bound() {
            return callback.apply(thisp, arguments);
        }
        Q(bound).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nbind = function (/*thisp, ...args*/) {
    var args = array_slice(arguments, 0);
    args.unshift(this);
    return Q.nbind.apply(void 0, args);
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback with a given array of arguments, plus a provided callback.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param {Array} args arguments to pass to the method; the callback
 * will be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nmapply = // XXX As proposed by "Redsandro"
Q.npost = function (object, name, args) {
    return Q(object).npost(name, args);
};

Promise.prototype.nmapply = // XXX As proposed by "Redsandro"
Promise.prototype.npost = function (name, args) {
    var nodeArgs = array_slice(args || []);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nsend = // XXX Based on Mark Miller's proposed "send"
Q.nmcall = // XXX Based on "Redsandro's" proposal
Q.ninvoke = function (object, name /*...args*/) {
    var nodeArgs = array_slice(arguments, 2);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    Q(object).dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

Promise.prototype.nsend = // XXX Based on Mark Miller's proposed "send"
Promise.prototype.nmcall = // XXX Based on "Redsandro's" proposal
Promise.prototype.ninvoke = function (name /*...args*/) {
    var nodeArgs = array_slice(arguments, 1);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * If a function would like to support both Node continuation-passing-style and
 * promise-returning-style, it can end its internal promise chain with
 * `nodeify(nodeback)`, forwarding the optional nodeback argument.  If the user
 * elects to use a nodeback, the result will be sent there.  If they do not
 * pass a nodeback, they will receive the result promise.
 * @param object a result (or a promise for a result)
 * @param {Function} nodeback a Node.js-style callback
 * @returns either the promise or nothing
 */
Q.nodeify = nodeify;
function nodeify(object, nodeback) {
    return Q(object).nodeify(nodeback);
}

Promise.prototype.nodeify = function (nodeback) {
    if (nodeback) {
        this.then(function (value) {
            Q.nextTick(function () {
                nodeback(null, value);
            });
        }, function (error) {
            Q.nextTick(function () {
                nodeback(error);
            });
        });
    } else {
        return this;
    }
};

Q.noConflict = function() {
    throw new Error("Q.noConflict only works when Q is used as a global");
};

// All code before this point will be filtered from stack traces.
var qEndingLine = captureLine();

return Q;

});

}).call(this,require('_process'),require("timers").setImmediate)
},{"_process":51,"timers":52}],2:[function(require,module,exports){
module.exports = require('./lib/axios');
},{"./lib/axios":4}],3:[function(require,module,exports){
(function (process){
'use strict';

var utils = require('./../utils');
var settle = require('./../core/settle');
var buildURL = require('./../helpers/buildURL');
var parseHeaders = require('./../helpers/parseHeaders');
var isURLSameOrigin = require('./../helpers/isURLSameOrigin');
var createError = require('../core/createError');
var btoa = (typeof window !== 'undefined' && window.btoa && window.btoa.bind(window)) || require('./../helpers/btoa');

module.exports = function xhrAdapter(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    var requestData = config.data;
    var requestHeaders = config.headers;

    if (utils.isFormData(requestData)) {
      delete requestHeaders['Content-Type']; // Let the browser set it
    }

    var request = new XMLHttpRequest();
    var loadEvent = 'onreadystatechange';
    var xDomain = false;

    // For IE 8/9 CORS support
    // Only supports POST and GET calls and doesn't returns the response headers.
    // DON'T do this for testing b/c XMLHttpRequest is mocked, not XDomainRequest.
    if (process.env.NODE_ENV !== 'test' &&
        typeof window !== 'undefined' &&
        window.XDomainRequest && !('withCredentials' in request) &&
        !isURLSameOrigin(config.url)) {
      request = new window.XDomainRequest();
      loadEvent = 'onload';
      xDomain = true;
      request.onprogress = function handleProgress() {};
      request.ontimeout = function handleTimeout() {};
    }

    // HTTP basic authentication
    if (config.auth) {
      var username = config.auth.username || '';
      var password = config.auth.password || '';
      requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
    }

    request.open(config.method.toUpperCase(), buildURL(config.url, config.params, config.paramsSerializer), true);

    // Set the request timeout in MS
    request.timeout = config.timeout;

    // Listen for ready state
    request[loadEvent] = function handleLoad() {
      if (!request || (request.readyState !== 4 && !xDomain)) {
        return;
      }

      // The request errored out and we didn't get a response, this will be
      // handled by onerror instead
      // With one exception: request that using file: protocol, most browsers
      // will return status as 0 even though it's a successful request
      if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
        return;
      }

      // Prepare the response
      var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
      var responseData = !config.responseType || config.responseType === 'text' ? request.responseText : request.response;
      var response = {
        data: responseData,
        // IE sends 1223 instead of 204 (https://github.com/axios/axios/issues/201)
        status: request.status === 1223 ? 204 : request.status,
        statusText: request.status === 1223 ? 'No Content' : request.statusText,
        headers: responseHeaders,
        config: config,
        request: request
      };

      settle(resolve, reject, response);

      // Clean up request
      request = null;
    };

    // Handle low level network errors
    request.onerror = function handleError() {
      // Real errors are hidden from us by the browser
      // onerror should only fire if it's a network error
      reject(createError('Network Error', config, null, request));

      // Clean up request
      request = null;
    };

    // Handle timeout
    request.ontimeout = function handleTimeout() {
      reject(createError('timeout of ' + config.timeout + 'ms exceeded', config, 'ECONNABORTED',
        request));

      // Clean up request
      request = null;
    };

    // Add xsrf header
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.
    if (utils.isStandardBrowserEnv()) {
      var cookies = require('./../helpers/cookies');

      // Add xsrf header
      var xsrfValue = (config.withCredentials || isURLSameOrigin(config.url)) && config.xsrfCookieName ?
          cookies.read(config.xsrfCookieName) :
          undefined;

      if (xsrfValue) {
        requestHeaders[config.xsrfHeaderName] = xsrfValue;
      }
    }

    // Add headers to the request
    if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders, function setRequestHeader(val, key) {
        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
          // Remove Content-Type if data is undefined
          delete requestHeaders[key];
        } else {
          // Otherwise add header to the request
          request.setRequestHeader(key, val);
        }
      });
    }

    // Add withCredentials to request if needed
    if (config.withCredentials) {
      request.withCredentials = true;
    }

    // Add responseType to request if needed
    if (config.responseType) {
      try {
        request.responseType = config.responseType;
      } catch (e) {
        // Expected DOMException thrown by browsers not compatible XMLHttpRequest Level 2.
        // But, this can be suppressed for 'json' type as it can be parsed by default 'transformResponse' function.
        if (config.responseType !== 'json') {
          throw e;
        }
      }
    }

    // Handle progress if needed
    if (typeof config.onDownloadProgress === 'function') {
      request.addEventListener('progress', config.onDownloadProgress);
    }

    // Not all browsers support upload events
    if (typeof config.onUploadProgress === 'function' && request.upload) {
      request.upload.addEventListener('progress', config.onUploadProgress);
    }

    if (config.cancelToken) {
      // Handle cancellation
      config.cancelToken.promise.then(function onCanceled(cancel) {
        if (!request) {
          return;
        }

        request.abort();
        reject(cancel);
        // Clean up request
        request = null;
      });
    }

    if (requestData === undefined) {
      requestData = null;
    }

    // Send the request
    request.send(requestData);
  });
};

}).call(this,require('_process'))
},{"../core/createError":10,"./../core/settle":13,"./../helpers/btoa":17,"./../helpers/buildURL":18,"./../helpers/cookies":20,"./../helpers/isURLSameOrigin":22,"./../helpers/parseHeaders":24,"./../utils":26,"_process":51}],4:[function(require,module,exports){
'use strict';

var utils = require('./utils');
var bind = require('./helpers/bind');
var Axios = require('./core/Axios');
var defaults = require('./defaults');

/**
 * Create an instance of Axios
 *
 * @param {Object} defaultConfig The default config for the instance
 * @return {Axios} A new instance of Axios
 */
function createInstance(defaultConfig) {
  var context = new Axios(defaultConfig);
  var instance = bind(Axios.prototype.request, context);

  // Copy axios.prototype to instance
  utils.extend(instance, Axios.prototype, context);

  // Copy context to instance
  utils.extend(instance, context);

  return instance;
}

// Create the default instance to be exported
var axios = createInstance(defaults);

// Expose Axios class to allow class inheritance
axios.Axios = Axios;

// Factory for creating new instances
axios.create = function create(instanceConfig) {
  return createInstance(utils.merge(defaults, instanceConfig));
};

// Expose Cancel & CancelToken
axios.Cancel = require('./cancel/Cancel');
axios.CancelToken = require('./cancel/CancelToken');
axios.isCancel = require('./cancel/isCancel');

// Expose all/spread
axios.all = function all(promises) {
  return Promise.all(promises);
};
axios.spread = require('./helpers/spread');

module.exports = axios;

// Allow use of default import syntax in TypeScript
module.exports.default = axios;

},{"./cancel/Cancel":5,"./cancel/CancelToken":6,"./cancel/isCancel":7,"./core/Axios":8,"./defaults":15,"./helpers/bind":16,"./helpers/spread":25,"./utils":26}],5:[function(require,module,exports){
'use strict';

/**
 * A `Cancel` is an object that is thrown when an operation is canceled.
 *
 * @class
 * @param {string=} message The message.
 */
function Cancel(message) {
  this.message = message;
}

Cancel.prototype.toString = function toString() {
  return 'Cancel' + (this.message ? ': ' + this.message : '');
};

Cancel.prototype.__CANCEL__ = true;

module.exports = Cancel;

},{}],6:[function(require,module,exports){
'use strict';

var Cancel = require('./Cancel');

/**
 * A `CancelToken` is an object that can be used to request cancellation of an operation.
 *
 * @class
 * @param {Function} executor The executor function.
 */
function CancelToken(executor) {
  if (typeof executor !== 'function') {
    throw new TypeError('executor must be a function.');
  }

  var resolvePromise;
  this.promise = new Promise(function promiseExecutor(resolve) {
    resolvePromise = resolve;
  });

  var token = this;
  executor(function cancel(message) {
    if (token.reason) {
      // Cancellation has already been requested
      return;
    }

    token.reason = new Cancel(message);
    resolvePromise(token.reason);
  });
}

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
CancelToken.prototype.throwIfRequested = function throwIfRequested() {
  if (this.reason) {
    throw this.reason;
  }
};

/**
 * Returns an object that contains a new `CancelToken` and a function that, when called,
 * cancels the `CancelToken`.
 */
CancelToken.source = function source() {
  var cancel;
  var token = new CancelToken(function executor(c) {
    cancel = c;
  });
  return {
    token: token,
    cancel: cancel
  };
};

module.exports = CancelToken;

},{"./Cancel":5}],7:[function(require,module,exports){
'use strict';

module.exports = function isCancel(value) {
  return !!(value && value.__CANCEL__);
};

},{}],8:[function(require,module,exports){
'use strict';

var defaults = require('./../defaults');
var utils = require('./../utils');
var InterceptorManager = require('./InterceptorManager');
var dispatchRequest = require('./dispatchRequest');

/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 */
function Axios(instanceConfig) {
  this.defaults = instanceConfig;
  this.interceptors = {
    request: new InterceptorManager(),
    response: new InterceptorManager()
  };
}

/**
 * Dispatch a request
 *
 * @param {Object} config The config specific for this request (merged with this.defaults)
 */
Axios.prototype.request = function request(config) {
  /*eslint no-param-reassign:0*/
  // Allow for axios('example/url'[, config]) a la fetch API
  if (typeof config === 'string') {
    config = utils.merge({
      url: arguments[0]
    }, arguments[1]);
  }

  config = utils.merge(defaults, {method: 'get'}, this.defaults, config);
  config.method = config.method.toLowerCase();

  // Hook up interceptors middleware
  var chain = [dispatchRequest, undefined];
  var promise = Promise.resolve(config);

  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    chain.unshift(interceptor.fulfilled, interceptor.rejected);
  });

  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
    chain.push(interceptor.fulfilled, interceptor.rejected);
  });

  while (chain.length) {
    promise = promise.then(chain.shift(), chain.shift());
  }

  return promise;
};

// Provide aliases for supported request methods
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, config) {
    return this.request(utils.merge(config || {}, {
      method: method,
      url: url
    }));
  };
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, data, config) {
    return this.request(utils.merge(config || {}, {
      method: method,
      url: url,
      data: data
    }));
  };
});

module.exports = Axios;

},{"./../defaults":15,"./../utils":26,"./InterceptorManager":9,"./dispatchRequest":11}],9:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

function InterceptorManager() {
  this.handlers = [];
}

/**
 * Add a new interceptor to the stack
 *
 * @param {Function} fulfilled The function to handle `then` for a `Promise`
 * @param {Function} rejected The function to handle `reject` for a `Promise`
 *
 * @return {Number} An ID used to remove interceptor later
 */
InterceptorManager.prototype.use = function use(fulfilled, rejected) {
  this.handlers.push({
    fulfilled: fulfilled,
    rejected: rejected
  });
  return this.handlers.length - 1;
};

/**
 * Remove an interceptor from the stack
 *
 * @param {Number} id The ID that was returned by `use`
 */
InterceptorManager.prototype.eject = function eject(id) {
  if (this.handlers[id]) {
    this.handlers[id] = null;
  }
};

/**
 * Iterate over all the registered interceptors
 *
 * This method is particularly useful for skipping over any
 * interceptors that may have become `null` calling `eject`.
 *
 * @param {Function} fn The function to call for each interceptor
 */
InterceptorManager.prototype.forEach = function forEach(fn) {
  utils.forEach(this.handlers, function forEachHandler(h) {
    if (h !== null) {
      fn(h);
    }
  });
};

module.exports = InterceptorManager;

},{"./../utils":26}],10:[function(require,module,exports){
'use strict';

var enhanceError = require('./enhanceError');

/**
 * Create an Error with the specified message, config, error code, request and response.
 *
 * @param {string} message The error message.
 * @param {Object} config The config.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The created error.
 */
module.exports = function createError(message, config, code, request, response) {
  var error = new Error(message);
  return enhanceError(error, config, code, request, response);
};

},{"./enhanceError":12}],11:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
var transformData = require('./transformData');
var isCancel = require('../cancel/isCancel');
var defaults = require('../defaults');
var isAbsoluteURL = require('./../helpers/isAbsoluteURL');
var combineURLs = require('./../helpers/combineURLs');

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }
}

/**
 * Dispatch a request to the server using the configured adapter.
 *
 * @param {object} config The config that is to be used for the request
 * @returns {Promise} The Promise to be fulfilled
 */
module.exports = function dispatchRequest(config) {
  throwIfCancellationRequested(config);

  // Support baseURL config
  if (config.baseURL && !isAbsoluteURL(config.url)) {
    config.url = combineURLs(config.baseURL, config.url);
  }

  // Ensure headers exist
  config.headers = config.headers || {};

  // Transform request data
  config.data = transformData(
    config.data,
    config.headers,
    config.transformRequest
  );

  // Flatten headers
  config.headers = utils.merge(
    config.headers.common || {},
    config.headers[config.method] || {},
    config.headers || {}
  );

  utils.forEach(
    ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
    function cleanHeaderConfig(method) {
      delete config.headers[method];
    }
  );

  var adapter = config.adapter || defaults.adapter;

  return adapter(config).then(function onAdapterResolution(response) {
    throwIfCancellationRequested(config);

    // Transform response data
    response.data = transformData(
      response.data,
      response.headers,
      config.transformResponse
    );

    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);

      // Transform response data
      if (reason && reason.response) {
        reason.response.data = transformData(
          reason.response.data,
          reason.response.headers,
          config.transformResponse
        );
      }
    }

    return Promise.reject(reason);
  });
};

},{"../cancel/isCancel":7,"../defaults":15,"./../helpers/combineURLs":19,"./../helpers/isAbsoluteURL":21,"./../utils":26,"./transformData":14}],12:[function(require,module,exports){
'use strict';

/**
 * Update an Error with the specified config, error code, and response.
 *
 * @param {Error} error The error to update.
 * @param {Object} config The config.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The error.
 */
module.exports = function enhanceError(error, config, code, request, response) {
  error.config = config;
  if (code) {
    error.code = code;
  }
  error.request = request;
  error.response = response;
  return error;
};

},{}],13:[function(require,module,exports){
'use strict';

var createError = require('./createError');

/**
 * Resolve or reject a Promise based on response status.
 *
 * @param {Function} resolve A function that resolves the promise.
 * @param {Function} reject A function that rejects the promise.
 * @param {object} response The response.
 */
module.exports = function settle(resolve, reject, response) {
  var validateStatus = response.config.validateStatus;
  // Note: status is not exposed by XDomainRequest
  if (!response.status || !validateStatus || validateStatus(response.status)) {
    resolve(response);
  } else {
    reject(createError(
      'Request failed with status code ' + response.status,
      response.config,
      null,
      response.request,
      response
    ));
  }
};

},{"./createError":10}],14:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

/**
 * Transform the data for a request or a response
 *
 * @param {Object|String} data The data to be transformed
 * @param {Array} headers The headers for the request or response
 * @param {Array|Function} fns A single function or Array of functions
 * @returns {*} The resulting transformed data
 */
module.exports = function transformData(data, headers, fns) {
  /*eslint no-param-reassign:0*/
  utils.forEach(fns, function transform(fn) {
    data = fn(data, headers);
  });

  return data;
};

},{"./../utils":26}],15:[function(require,module,exports){
(function (process){
'use strict';

var utils = require('./utils');
var normalizeHeaderName = require('./helpers/normalizeHeaderName');

var DEFAULT_CONTENT_TYPE = {
  'Content-Type': 'application/x-www-form-urlencoded'
};

function setContentTypeIfUnset(headers, value) {
  if (!utils.isUndefined(headers) && utils.isUndefined(headers['Content-Type'])) {
    headers['Content-Type'] = value;
  }
}

function getDefaultAdapter() {
  var adapter;
  if (typeof XMLHttpRequest !== 'undefined') {
    // For browsers use XHR adapter
    adapter = require('./adapters/xhr');
  } else if (typeof process !== 'undefined') {
    // For node use HTTP adapter
    adapter = require('./adapters/http');
  }
  return adapter;
}

var defaults = {
  adapter: getDefaultAdapter(),

  transformRequest: [function transformRequest(data, headers) {
    normalizeHeaderName(headers, 'Content-Type');
    if (utils.isFormData(data) ||
      utils.isArrayBuffer(data) ||
      utils.isBuffer(data) ||
      utils.isStream(data) ||
      utils.isFile(data) ||
      utils.isBlob(data)
    ) {
      return data;
    }
    if (utils.isArrayBufferView(data)) {
      return data.buffer;
    }
    if (utils.isURLSearchParams(data)) {
      setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
      return data.toString();
    }
    if (utils.isObject(data)) {
      setContentTypeIfUnset(headers, 'application/json;charset=utf-8');
      return JSON.stringify(data);
    }
    return data;
  }],

  transformResponse: [function transformResponse(data) {
    /*eslint no-param-reassign:0*/
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) { /* Ignore */ }
    }
    return data;
  }],

  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,

  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',

  maxContentLength: -1,

  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  }
};

defaults.headers = {
  common: {
    'Accept': 'application/json, text/plain, */*'
  }
};

utils.forEach(['delete', 'get', 'head'], function forEachMethodNoData(method) {
  defaults.headers[method] = {};
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  defaults.headers[method] = utils.merge(DEFAULT_CONTENT_TYPE);
});

module.exports = defaults;

}).call(this,require('_process'))
},{"./adapters/http":3,"./adapters/xhr":3,"./helpers/normalizeHeaderName":23,"./utils":26,"_process":51}],16:[function(require,module,exports){
'use strict';

module.exports = function bind(fn, thisArg) {
  return function wrap() {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }
    return fn.apply(thisArg, args);
  };
};

},{}],17:[function(require,module,exports){
'use strict';

// btoa polyfill for IE<10 courtesy https://github.com/davidchambers/Base64.js

var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function E() {
  this.message = 'String contains an invalid character';
}
E.prototype = new Error;
E.prototype.code = 5;
E.prototype.name = 'InvalidCharacterError';

function btoa(input) {
  var str = String(input);
  var output = '';
  for (
    // initialize result and counter
    var block, charCode, idx = 0, map = chars;
    // if the next str index does not exist:
    //   change the mapping table to "="
    //   check if d has no fractional digits
    str.charAt(idx | 0) || (map = '=', idx % 1);
    // "8 - idx % 1 * 8" generates the sequence 2, 4, 6, 8
    output += map.charAt(63 & block >> 8 - idx % 1 * 8)
  ) {
    charCode = str.charCodeAt(idx += 3 / 4);
    if (charCode > 0xFF) {
      throw new E();
    }
    block = block << 8 | charCode;
  }
  return output;
}

module.exports = btoa;

},{}],18:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

function encode(val) {
  return encodeURIComponent(val).
    replace(/%40/gi, '@').
    replace(/%3A/gi, ':').
    replace(/%24/g, '$').
    replace(/%2C/gi, ',').
    replace(/%20/g, '+').
    replace(/%5B/gi, '[').
    replace(/%5D/gi, ']');
}

/**
 * Build a URL by appending params to the end
 *
 * @param {string} url The base of the url (e.g., http://www.google.com)
 * @param {object} [params] The params to be appended
 * @returns {string} The formatted url
 */
module.exports = function buildURL(url, params, paramsSerializer) {
  /*eslint no-param-reassign:0*/
  if (!params) {
    return url;
  }

  var serializedParams;
  if (paramsSerializer) {
    serializedParams = paramsSerializer(params);
  } else if (utils.isURLSearchParams(params)) {
    serializedParams = params.toString();
  } else {
    var parts = [];

    utils.forEach(params, function serialize(val, key) {
      if (val === null || typeof val === 'undefined') {
        return;
      }

      if (utils.isArray(val)) {
        key = key + '[]';
      } else {
        val = [val];
      }

      utils.forEach(val, function parseValue(v) {
        if (utils.isDate(v)) {
          v = v.toISOString();
        } else if (utils.isObject(v)) {
          v = JSON.stringify(v);
        }
        parts.push(encode(key) + '=' + encode(v));
      });
    });

    serializedParams = parts.join('&');
  }

  if (serializedParams) {
    url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
  }

  return url;
};

},{"./../utils":26}],19:[function(require,module,exports){
'use strict';

/**
 * Creates a new URL by combining the specified URLs
 *
 * @param {string} baseURL The base URL
 * @param {string} relativeURL The relative URL
 * @returns {string} The combined URL
 */
module.exports = function combineURLs(baseURL, relativeURL) {
  return relativeURL
    ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
    : baseURL;
};

},{}],20:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

module.exports = (
  utils.isStandardBrowserEnv() ?

  // Standard browser envs support document.cookie
  (function standardBrowserEnv() {
    return {
      write: function write(name, value, expires, path, domain, secure) {
        var cookie = [];
        cookie.push(name + '=' + encodeURIComponent(value));

        if (utils.isNumber(expires)) {
          cookie.push('expires=' + new Date(expires).toGMTString());
        }

        if (utils.isString(path)) {
          cookie.push('path=' + path);
        }

        if (utils.isString(domain)) {
          cookie.push('domain=' + domain);
        }

        if (secure === true) {
          cookie.push('secure');
        }

        document.cookie = cookie.join('; ');
      },

      read: function read(name) {
        var match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
        return (match ? decodeURIComponent(match[3]) : null);
      },

      remove: function remove(name) {
        this.write(name, '', Date.now() - 86400000);
      }
    };
  })() :

  // Non standard browser env (web workers, react-native) lack needed support.
  (function nonStandardBrowserEnv() {
    return {
      write: function write() {},
      read: function read() { return null; },
      remove: function remove() {}
    };
  })()
);

},{"./../utils":26}],21:[function(require,module,exports){
'use strict';

/**
 * Determines whether the specified URL is absolute
 *
 * @param {string} url The URL to test
 * @returns {boolean} True if the specified URL is absolute, otherwise false
 */
module.exports = function isAbsoluteURL(url) {
  // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
  // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
  // by any combination of letters, digits, plus, period, or hyphen.
  return /^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(url);
};

},{}],22:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

module.exports = (
  utils.isStandardBrowserEnv() ?

  // Standard browser envs have full support of the APIs needed to test
  // whether the request URL is of the same origin as current location.
  (function standardBrowserEnv() {
    var msie = /(msie|trident)/i.test(navigator.userAgent);
    var urlParsingNode = document.createElement('a');
    var originURL;

    /**
    * Parse a URL to discover it's components
    *
    * @param {String} url The URL to be parsed
    * @returns {Object}
    */
    function resolveURL(url) {
      var href = url;

      if (msie) {
        // IE needs attribute set twice to normalize properties
        urlParsingNode.setAttribute('href', href);
        href = urlParsingNode.href;
      }

      urlParsingNode.setAttribute('href', href);

      // urlParsingNode provides the UrlUtils interface - http://url.spec.whatwg.org/#urlutils
      return {
        href: urlParsingNode.href,
        protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, '') : '',
        host: urlParsingNode.host,
        search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, '') : '',
        hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, '') : '',
        hostname: urlParsingNode.hostname,
        port: urlParsingNode.port,
        pathname: (urlParsingNode.pathname.charAt(0) === '/') ?
                  urlParsingNode.pathname :
                  '/' + urlParsingNode.pathname
      };
    }

    originURL = resolveURL(window.location.href);

    /**
    * Determine if a URL shares the same origin as the current location
    *
    * @param {String} requestURL The URL to test
    * @returns {boolean} True if URL shares the same origin, otherwise false
    */
    return function isURLSameOrigin(requestURL) {
      var parsed = (utils.isString(requestURL)) ? resolveURL(requestURL) : requestURL;
      return (parsed.protocol === originURL.protocol &&
            parsed.host === originURL.host);
    };
  })() :

  // Non standard browser envs (web workers, react-native) lack needed support.
  (function nonStandardBrowserEnv() {
    return function isURLSameOrigin() {
      return true;
    };
  })()
);

},{"./../utils":26}],23:[function(require,module,exports){
'use strict';

var utils = require('../utils');

module.exports = function normalizeHeaderName(headers, normalizedName) {
  utils.forEach(headers, function processHeader(value, name) {
    if (name !== normalizedName && name.toUpperCase() === normalizedName.toUpperCase()) {
      headers[normalizedName] = value;
      delete headers[name];
    }
  });
};

},{"../utils":26}],24:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

// Headers whose duplicates are ignored by node
// c.f. https://nodejs.org/api/http.html#http_message_headers
var ignoreDuplicateOf = [
  'age', 'authorization', 'content-length', 'content-type', 'etag',
  'expires', 'from', 'host', 'if-modified-since', 'if-unmodified-since',
  'last-modified', 'location', 'max-forwards', 'proxy-authorization',
  'referer', 'retry-after', 'user-agent'
];

/**
 * Parse headers into an object
 *
 * ```
 * Date: Wed, 27 Aug 2014 08:58:49 GMT
 * Content-Type: application/json
 * Connection: keep-alive
 * Transfer-Encoding: chunked
 * ```
 *
 * @param {String} headers Headers needing to be parsed
 * @returns {Object} Headers parsed into an object
 */
module.exports = function parseHeaders(headers) {
  var parsed = {};
  var key;
  var val;
  var i;

  if (!headers) { return parsed; }

  utils.forEach(headers.split('\n'), function parser(line) {
    i = line.indexOf(':');
    key = utils.trim(line.substr(0, i)).toLowerCase();
    val = utils.trim(line.substr(i + 1));

    if (key) {
      if (parsed[key] && ignoreDuplicateOf.indexOf(key) >= 0) {
        return;
      }
      if (key === 'set-cookie') {
        parsed[key] = (parsed[key] ? parsed[key] : []).concat([val]);
      } else {
        parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
      }
    }
  });

  return parsed;
};

},{"./../utils":26}],25:[function(require,module,exports){
'use strict';

/**
 * Syntactic sugar for invoking a function and expanding an array for arguments.
 *
 * Common use case would be to use `Function.prototype.apply`.
 *
 *  ```js
 *  function f(x, y, z) {}
 *  var args = [1, 2, 3];
 *  f.apply(null, args);
 *  ```
 *
 * With `spread` this example can be re-written.
 *
 *  ```js
 *  spread(function(x, y, z) {})([1, 2, 3]);
 *  ```
 *
 * @param {Function} callback
 * @returns {Function}
 */
module.exports = function spread(callback) {
  return function wrap(arr) {
    return callback.apply(null, arr);
  };
};

},{}],26:[function(require,module,exports){
'use strict';

var bind = require('./helpers/bind');
var isBuffer = require('is-buffer');

/*global toString:true*/

// utils is a library of generic helper functions non-specific to axios

var toString = Object.prototype.toString;

/**
 * Determine if a value is an Array
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Array, otherwise false
 */
function isArray(val) {
  return toString.call(val) === '[object Array]';
}

/**
 * Determine if a value is an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an ArrayBuffer, otherwise false
 */
function isArrayBuffer(val) {
  return toString.call(val) === '[object ArrayBuffer]';
}

/**
 * Determine if a value is a FormData
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an FormData, otherwise false
 */
function isFormData(val) {
  return (typeof FormData !== 'undefined') && (val instanceof FormData);
}

/**
 * Determine if a value is a view on an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
 */
function isArrayBufferView(val) {
  var result;
  if ((typeof ArrayBuffer !== 'undefined') && (ArrayBuffer.isView)) {
    result = ArrayBuffer.isView(val);
  } else {
    result = (val) && (val.buffer) && (val.buffer instanceof ArrayBuffer);
  }
  return result;
}

/**
 * Determine if a value is a String
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a String, otherwise false
 */
function isString(val) {
  return typeof val === 'string';
}

/**
 * Determine if a value is a Number
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Number, otherwise false
 */
function isNumber(val) {
  return typeof val === 'number';
}

/**
 * Determine if a value is undefined
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if the value is undefined, otherwise false
 */
function isUndefined(val) {
  return typeof val === 'undefined';
}

/**
 * Determine if a value is an Object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Object, otherwise false
 */
function isObject(val) {
  return val !== null && typeof val === 'object';
}

/**
 * Determine if a value is a Date
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Date, otherwise false
 */
function isDate(val) {
  return toString.call(val) === '[object Date]';
}

/**
 * Determine if a value is a File
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a File, otherwise false
 */
function isFile(val) {
  return toString.call(val) === '[object File]';
}

/**
 * Determine if a value is a Blob
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Blob, otherwise false
 */
function isBlob(val) {
  return toString.call(val) === '[object Blob]';
}

/**
 * Determine if a value is a Function
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Function, otherwise false
 */
function isFunction(val) {
  return toString.call(val) === '[object Function]';
}

/**
 * Determine if a value is a Stream
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Stream, otherwise false
 */
function isStream(val) {
  return isObject(val) && isFunction(val.pipe);
}

/**
 * Determine if a value is a URLSearchParams object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a URLSearchParams object, otherwise false
 */
function isURLSearchParams(val) {
  return typeof URLSearchParams !== 'undefined' && val instanceof URLSearchParams;
}

/**
 * Trim excess whitespace off the beginning and end of a string
 *
 * @param {String} str The String to trim
 * @returns {String} The String freed of excess whitespace
 */
function trim(str) {
  return str.replace(/^\s*/, '').replace(/\s*$/, '');
}

/**
 * Determine if we're running in a standard browser environment
 *
 * This allows axios to run in a web worker, and react-native.
 * Both environments support XMLHttpRequest, but not fully standard globals.
 *
 * web workers:
 *  typeof window -> undefined
 *  typeof document -> undefined
 *
 * react-native:
 *  navigator.product -> 'ReactNative'
 */
function isStandardBrowserEnv() {
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return false;
  }
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  );
}

/**
 * Iterate over an Array or an Object invoking a function for each item.
 *
 * If `obj` is an Array callback will be called passing
 * the value, index, and complete array for each item.
 *
 * If 'obj' is an Object callback will be called passing
 * the value, key, and complete object for each property.
 *
 * @param {Object|Array} obj The object to iterate
 * @param {Function} fn The callback to invoke for each item
 */
function forEach(obj, fn) {
  // Don't bother if no value provided
  if (obj === null || typeof obj === 'undefined') {
    return;
  }

  // Force an array if not already something iterable
  if (typeof obj !== 'object') {
    /*eslint no-param-reassign:0*/
    obj = [obj];
  }

  if (isArray(obj)) {
    // Iterate over array values
    for (var i = 0, l = obj.length; i < l; i++) {
      fn.call(null, obj[i], i, obj);
    }
  } else {
    // Iterate over object keys
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        fn.call(null, obj[key], key, obj);
      }
    }
  }
}

/**
 * Accepts varargs expecting each argument to be an object, then
 * immutably merges the properties of each object and returns result.
 *
 * When multiple objects contain the same key the later object in
 * the arguments list will take precedence.
 *
 * Example:
 *
 * ```js
 * var result = merge({foo: 123}, {foo: 456});
 * console.log(result.foo); // outputs 456
 * ```
 *
 * @param {Object} obj1 Object to merge
 * @returns {Object} Result of all merge properties
 */
function merge(/* obj1, obj2, obj3, ... */) {
  var result = {};
  function assignValue(val, key) {
    if (typeof result[key] === 'object' && typeof val === 'object') {
      result[key] = merge(result[key], val);
    } else {
      result[key] = val;
    }
  }

  for (var i = 0, l = arguments.length; i < l; i++) {
    forEach(arguments[i], assignValue);
  }
  return result;
}

/**
 * Extends object a by mutably adding to it the properties of object b.
 *
 * @param {Object} a The object to be extended
 * @param {Object} b The object to copy properties from
 * @param {Object} thisArg The object to bind function to
 * @return {Object} The resulting value of object a
 */
function extend(a, b, thisArg) {
  forEach(b, function assignValue(val, key) {
    if (thisArg && typeof val === 'function') {
      a[key] = bind(val, thisArg);
    } else {
      a[key] = val;
    }
  });
  return a;
}

module.exports = {
  isArray: isArray,
  isArrayBuffer: isArrayBuffer,
  isBuffer: isBuffer,
  isFormData: isFormData,
  isArrayBufferView: isArrayBufferView,
  isString: isString,
  isNumber: isNumber,
  isObject: isObject,
  isUndefined: isUndefined,
  isDate: isDate,
  isFile: isFile,
  isBlob: isBlob,
  isFunction: isFunction,
  isStream: isStream,
  isURLSearchParams: isURLSearchParams,
  isStandardBrowserEnv: isStandardBrowserEnv,
  forEach: forEach,
  merge: merge,
  extend: extend,
  trim: trim
};

},{"./helpers/bind":16,"is-buffer":29}],27:[function(require,module,exports){
!function(t){"use strict";function e(t,e){var i;for(i in e)e.hasOwnProperty(i)&&(t[i]=e[i])}function i(t){return t.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g,"\\$&")}var n={},s={},r={},a={},o={},J={},l={},d={},N={},u=Array.isArray,c={profile:{negative_threshold:-.3,positive_threshold:.3,amplitude_threshold:.3,polite_threshold:.2,dirty_threshold:.3},parser:["v1","v2"]},p="foreign",B="interrogative",g="exclamatory",V="headline",h="imperative",f="approval",m="refusal";t.detect=o,t.dependencies=J,t.inflector=d,t.compendium=n,t.lexer=s,t.parser=l,t.factory=r,t.pos=N,t.config=c,!function(){var i=["tuna","trout","spacecraft","salmon","halibut","aircraft","equipment","information","rice","money","species","series","fish","sheep","moose","deer","news","asbestos"],n=[[/^index$/gi,"indices"],[/^criterion$/gi,"criteria"],[/dix$/gi,"dices"],[/(a|o)ch$/gi,"$1chs"],[/(m)an$/gi,"$1en"],[/(pe)rson$/gi,"$1ople"],[/(child)$/gi,"$1ren"],[/^(ox)$/gi,"$1en"],[/(ax|test)is$/gi,"$1es"],[/(octop|vir)us$/gi,"$1i"],[/(alias|status)$/gi,"$1es"],[/(bu)s$/gi,"$1ses"],[/(buffal|tomat|potat|her)o$/gi,"$1oes"],[/([ti])um$/gi,"$1a"],[/sis$/gi,"ses"],[/(?:([^f])fe|([lr])f)$/gi,"$1$2ves"],[/(hive)$/gi,"$1s"],[/([^aeiouy]|qu)y$/gi,"$1ies"],[/(x|ch|ss|sh)$/gi,"$1es"],[/(matr|vert|ind)ix|ex$/gi,"$1ices"],[/([m|l])ouse$/gi,"$1ice"],[/(quiz)$/gi,"$1zes"],[/^gas$/gi,"gases"],[/s$/gi,"s"],[/$/gi,"s"]],s=[[/(m)en$/gi,"$1an"],[/(pe)ople$/gi,"$1rson"],[/(child)ren$/gi,"$1"],[/([ti])a$/gi,"$1um"],[/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)ses/gi,"$1$2sis"],[/(hive)s$/gi,"$1"],[/(tive)s$/gi,"$1"],[/(curve)s$/gi,"$1"],[/([lr])ves$/gi,"$1f"],[/([^fo])ves$/gi,"$1fe"],[/([^aeiouy]|qu)ies$/gi,"$1y"],[/(s)eries$/gi,"$1eries"],[/(m)ovies$/gi,"$1ovie"],[/(x|ch|ss|sh)es$/gi,"$1"],[/([m|l])ice$/gi,"$1ouse"],[/(bus)es$/gi,"$1"],[/(o)es$/gi,"$1"],[/(shoe)s$/gi,"$1"],[/(cris|ax|test)es$/gi,"$1is"],[/(octop|vir)i$/gi,"$1us"],[/(alias|status)es$/gi,"$1"],[/^(ox)en/gi,"$1"],[/(vert|ind)ices$/gi,"$1ex"],[/(matr)ices$/gi,"$1ix"],[/(quiz)zes$/gi,"$1"],[/s$/gi,""]],r=function(t,e,n){var s,r;if(i.indexOf(t.toLowerCase())>-1)return t;for(s=0,r=e.length;s<r;s++)if(t.match(e[s][0])){t=t.replace(e[s][0],e[s][1]);break}return t},a=function(t,e){var n,s;if(i.indexOf(t.toLowerCase())>-1)return!1;for(n=0,s=e.length;n<s;n++)if(t.match(e[n][0]))return!0;return!1},o="VBZ",J="VBG",l="VBN",N=function(t,e){return e===o?t+"s":e===J?t+"ing":e===l?t+"ed":t},u=function(t,e){return e===o?t+"s":e===J?t+t[t.length-1]+"ing":e===l?t+t[t.length-1]+"ed":t},c=function(t,e){var i=t.slice(0,t.length-1);return e===o?t+"s":e===J?i+"ing":e===l?i+"ed":t},p=function(t,e){var i=t.slice(0,t.length-1);return e===o?i+"ies":e===J?t+"ing":e===l?i+"ied":t},B=function(t,e){return e===o?t+"s":e===J?t+"ing":e===l?t+"d":t},g=function(t,e){return e===o?t+"s":e===J?t.slice(0,t.length-1)+"ing":e===l?t+"d":t},V=function(t,e){return e===o?t+"s":e===J?t.slice(0,t.length-2)+"ying":e===l?t+"d":t},h=function(t,e){return e===o?t+"es":e===J?t+"ing":e===l?t+"ed":t};e(d,{isSingular:function(t){return d.isUncountable(t)||a(t,n)},isPlural:function(t){return!t.match(/([saui]s|[^i]a)$/gi)&&a(t,s)},isUncountable:function(t){return i.indexOf(t)>-1},singularize:function(t){return d.isPlural(t)?r(t,s):t},pluralize:function(t){return d.isSingular(t)?r(t,n):t},conjugate:function(t,e){t[t.length-1];return t.match(/[^aeiou]y$/gi)?p(t,e):t.match(/[^aeiouy]e$/gi)?c(t,e):t.match(/([aeiuo][ptlgnm]|ir|cur|[^aeiuo][oua][db])$/gi)?u(t,e):t.match(/([ieao]ss|[aeiouy]zz|[aeiouy]ch|nch|rch|[aeiouy]sh|[iae]tch|ax)$/gi)?h(t,e):t.match(/(ee)$/gi)?B(t,e):t.match(/(ie)$/gi)?V(t,e):t.match(/(ue)$/gi)?g(t,e):t.match(/([uao]m[pb]|[oa]wn|ey|elp|[ei]gn|ilm|o[uo]r|[oa]ugh|igh|ki|ff|oubt|ount|awl|o[alo]d|[iu]rl|upt|[oa]y|ight|oid|empt|act|aud|e[ea]d|ound|[aeiou][srcln]t|ept|dd|[eia]n[dk]|[ioa][xk]|[oa]rm|[ue]rn|[ao]ng|uin|eam|ai[mr]|[oea]w|[eaoui][rscl]k|[oa]r[nd]|ear|er|it|ll)$/gi)?N(t,e):null},toPast:function(t){return d.conjugate(t,l)},toGerund:function(t){return d.conjugate(t,J)},toPresents:function(t){return d.conjugate(t,o)},infinitive:function(e){var i=t.lexicon[e];return i&&i.hasOwnProperty("infinitive")?i.infinitive:"are"===e||"am"===e||"'s"===e?"be":null}}),t.inflector=d}(),!function(){function e(t){throw new RangeError(P[t])}function i(t,e){for(var i=t.length,n=[];i--;)n[i]=e(t[i]);return n}function n(t,e){var n=t.split("@"),s="";n.length>1&&(s=n[0]+"@",t=n[1]),t=t.replace(k,".");var r=t.split("."),a=i(r,e).join(".");return s+a}function s(t){for(var e,i,n=[],s=0,r=t.length;s<r;)e=t.charCodeAt(s++),e>=55296&&e<=56319&&s<r?(i=t.charCodeAt(s++),56320==(64512&i)?n.push(((1023&e)<<10)+(1023&i)+65536):(n.push(e),s--)):n.push(e);return n}function r(t){return i(t,function(t){var e="";return t>65535&&(t-=65536,e+=E(t>>>10&1023|55296),t=56320|1023&t),e+=E(t)}).join("")}function a(t){return t-48<10?t-22:t-65<26?t-65:t-97<26?t-97:B}function o(t,e){return t+22+75*(t<26)-((0!=e)<<5)}function J(t,e,i){var n=0;for(t=i?M(t/f):t>>1,t+=M(t/e);t>R*V>>1;n+=B)t=M(t/R);return M(n+(R+1)*t/(t+h))}function l(t){var i,n,s,o,l,d,N,u,c,h,f=[],y=t.length,w=0,k=b,P=m;for(n=t.lastIndexOf(v),n<0&&(n=0),s=0;s<n;++s)t.charCodeAt(s)>=128&&e("not-basic"),f.push(t.charCodeAt(s));for(o=n>0?n+1:0;o<y;){for(l=w,d=1,N=B;o>=y&&e("invalid-input"),u=a(t.charCodeAt(o++)),(u>=B||u>M((p-w)/d))&&e("overflow"),w+=u*d,c=N<=P?g:N>=P+V?V:N-P,!(u<c);N+=B)h=B-c,d>M(p/h)&&e("overflow"),d*=h;i=f.length+1,P=J(w-l,i,0==l),M(w/i)>p-k&&e("overflow"),k+=M(w/i),w%=i,f.splice(w++,0,k)}return r(f)}function d(t){var i,n,r,a,l,d,N,u,c,h,f,y,w,k,P,R=[];for(t=s(t),y=t.length,i=b,n=0,l=m,d=0;d<y;++d)f=t[d],f<128&&R.push(E(f));for(r=a=R.length,a&&R.push(v);r<y;){for(N=p,d=0;d<y;++d)f=t[d],f>=i&&f<N&&(N=f);for(w=r+1,N-i>M((p-n)/w)&&e("overflow"),n+=(N-i)*w,i=N,d=0;d<y;++d)if(f=t[d],f<i&&++n>p&&e("overflow"),f==i){for(u=n,c=B;h=c<=l?g:c>=l+V?V:c-l,!(u<h);c+=B)P=u-h,k=B-h,R.push(E(o(h+P%k,0))),u=M(P/k);R.push(E(o(u,0))),l=J(n,w,r==a),n=0,++r}++n,++i}return R.join("")}function N(t){return n(t,function(t){return y.test(t)?l(t.slice(4).toLowerCase()):t})}function u(t){return n(t,function(t){return w.test(t)?"xn--"+d(t):t})}var c,p=2147483647,B=36,g=1,V=26,h=38,f=700,m=72,b=128,v="-",y=/^xn--/,w=/[^\x20-\x7E]/,k=/[\x2E\u3002\uFF0E\uFF61]/g,P={overflow:"Overflow: input needs wider integers to process","not-basic":"Illegal input >= 0x80 (not a basic code point)","invalid-input":"Invalid input"},R=B-g,M=Math.floor,E=String.fromCharCode;c={version:"1.3.2",ucs2:{decode:s,encode:r},decode:l,encode:d,toASCII:u,toUnicode:N},t.punycode=c}(),!function(){var e={ational:"ate",tional:"tion",enci:"ence",anci:"ance",izer:"ize",bli:"ble",alli:"al",entli:"ent",eli:"e",ousli:"ous",ization:"ize",ation:"ate",ator:"ate",alism:"al",iveness:"ive",fulness:"ful",ousness:"ous",aliti:"al",iviti:"ive",biliti:"ble",logi:"log"},i={icate:"ic",ative:"",alize:"al",iciti:"ic",ical:"ic",ful:"",ness:""},n="[^aeiou]",s="[aeiouy]",r=n+"[^aeiouy]*",a=s+"[aeiou]*",o="^("+r+")?"+a+r,J="^("+r+")?"+a+r+"("+a+")?$",l="^("+r+")?"+a+r+a+r,d="^("+r+")?"+s,N=function(t){var n,a,N,u,c,p,B,g;return t.length<3?t:(N=t.substr(0,1),"y"==N&&(t=N.toUpperCase()+t.substr(1)),c=/^(.+?)(ss|i)es$/,p=/^(.+?)([^s])s$/,c.test(t)?t=t.replace(c,"$1$2"):p.test(t)&&(t=t.replace(p,"$1$2")),c=/^(.+?)eed$/,p=/^(.+?)(ed|ing)$/,c.test(t)?(u=c.exec(t),c=new RegExp(o),c.test(u[1])&&(c=/.$/,t=t.replace(c,""))):p.test(t)&&(u=p.exec(t),n=u[1],p=new RegExp(d),p.test(n)&&(t=n,p=/(at|bl|iz)$/,B=new RegExp("([^aeiouylsz])\\1$"),g=new RegExp("^"+r+s+"[^aeiouwxy]$"),p.test(t)?t+="e":B.test(t)?(c=/.$/,t=t.replace(c,"")):g.test(t)&&(t+="e"))),c=/^(.+?)y$/,c.test(t)&&(u=c.exec(t),n=u[1],c=new RegExp(d),c.test(n)&&(t=n+"i")),c=/^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/,c.test(t)&&(u=c.exec(t),n=u[1],a=u[2],c=new RegExp(o),c.test(n)&&(t=n+e[a])),c=/^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/,c.test(t)&&(u=c.exec(t),n=u[1],a=u[2],c=new RegExp(o),c.test(n)&&(t=n+i[a])),c=/^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/,p=/^(.+?)(s|t)(ion)$/,c.test(t)?(u=c.exec(t),n=u[1],c=new RegExp(l),c.test(n)&&(t=n)):p.test(t)&&(u=p.exec(t),n=u[1]+u[2],p=new RegExp(l),p.test(n)&&(t=n)),c=/^(.+?)e$/,c.test(t)&&(u=c.exec(t),n=u[1],c=new RegExp(l),p=new RegExp(J),B=new RegExp("^"+r+s+"[^aeiouwxy]$"),(c.test(n)||p.test(n)&&!B.test(n))&&(t=n)),c=/ll$/,p=new RegExp(l),c.test(t)&&p.test(t)&&(c=/.$/,t=t.replace(c,"")),"y"==N&&(t=N.toLowerCase()+t.substr(1)),t)};t.stemmer=N}(),!function(){var t=function(){this.t_={}};t.prototype.add=function(t,e){throw new Error("Not implmented")},t.prototype.isset=function(t){return null!==this.get(t)},t.prototype.get=function(t){throw new Error("Not implmented")}}(),!function(){var e=["en","fr"];a.toObject=function(t,e){},a.applyPOS=function(e,i,n){var s,a,o;for(o=t.tag(i,n),e.tags=o.tags,e.stats.confidence=o.confidence,s=0,a=i.length;s<a;s++)e.tokens.push(r.token(i[s],o.norms[s],o.tags[s]));return e.length=a,e},a.analyse=function(e,i,n){var d,N,u,p,B,g,V,h,f,m=[];for(N=s.advanced(t.decode(e),i),u=N.sentences,d=0,p=u.length;d<p;d++){for(B=Date.now(),g=r.sentence(N.raws[d],i),a.applyPOS(g,u[d],i),t.stat(g),h=o.context(),V=0,f=g.tokens.length;V<f;V++)o.apply("t",!0,n,g.tokens[V],V,g,h);for(o.apply("s",!0,n,g,d,m,h),c.parser.indexOf("v1")>-1&&J.parse(g),c.parser.indexOf("v1")>-1&&l.parse(g),V=0,f=g.tokens.length;V<f;V++)o.apply("t",!1,n,g.tokens[V],V,g,h);m.push(g),o.apply("s",!1,n,g,d,m,h),g.time=Date.now()-B}return m},t.analyse=function(t,i,n){var s=null;if(i=i||"en",e.indexOf(i)===-1)throw new Error("Compendium supports only the following languages: "+e.join(", "));return s=a.analyse(t,i,n),o.apply("p",!1,n,s),s}}(),!function(){e(n,{verbs:"accept add admire admit advise afford agree alert allow amuse analyse analyze announce annoy answer apologise appear applaud appreciate approve argue arrange arrest arrive ask attach attack attempt attend attract avoid back bake balance ban bang bare bat bathe battle beam beg behave belong bleach bless blind blink blot blush boast boil bolt bomb book bore borrow bounce bow box brake branch breathe bruise brush bubble bump burn bury buzz calculate call camp care carry carve cause challenge change charge chase cheat check cheer chew choke chop claim clap clean clear clip close coach coil collect colour comb command communicate compare compete complain complete concentrate concern confess confuse connect consider consist contain continue copy correct cough count cover crack crash crawl cross crush cry cure curl curve cycle dam damage dance dare decay deceive decide decorate delay delight deliver depend describe desert deserve destroy detect develop disagree disappear disapprove disarm discover dislike divide double doubt drag drain dream dress drip drop drown drum dry dust earn educate embarrass employ empty encourage end enjoy enter entertain escape examine excite excuse exercise exist expand expect explain explode extend face fade fail fancy fasten fax fear fence fetch file fill film fire fit fix flap flash float flood flow flower fold follow fool force form found frame frighten fry gather gaze glow glue grab grate grease greet grin grip groan guarantee guard guess guide hammer hand handle hang happen harass harm hate haunt head heal heap heat help hook hop hope hover hug hum hunt hurry identify ignore imagine impress improve include increase influence inform inject injure instruct intend interest interfere interrupt introduce invent invite irritate itch jail jam jog join joke judge juggle jump kick kill kiss kneel knit knock knot label land last laugh launch learn level license lick lie lighten like list listen live load lock long look love man manage mark marry match mate matter measure meddle melt memorise mend mess up milk mine miss mix moan moor mourn move muddle mug multiply murder nail name need nest nod note notice number obey object observe obtain occur offend offer open order overflow owe own pack paddle paint park part pass paste pat pause peck pedal peel peep perform permit phone pick pinch pine place plan plant play please plug point poke polish pop possess post pour practise practice pray preach precede prefer prepare present preserve press pretend prevent prick print produce program promise protect provide pull pump punch puncture punish push question queue race radiate rain raise reach realise receive recognise record reduce reflect refuse regret reign reject rejoice relax release rely remain remember remind remove repair repeat replace reply report reproduce request rescue retire return rhyme rinse risk rob rock roll rot rub ruin rule rush sack sail satisfy save scare scatter scold scorch scrape scratch scream screw scribble scrub seal search separate serve settle shade share shave shelter shiver shock shop shrug sigh sign signal sin sip ski skip slap slip slow smash smell smile smoke snatch sneeze sniff snore snow soak soothe sound spare spark sparkle spell spill spoil spot spray sprout squash squeak squeal squeeze stain stamp stare start stay steer step stir stitch stop store strap strengthen stretch strip stroke stuff subtract succeed suck suffer suggest suit supply support suppose surprise surround suspect suspend switch talk tame tap taste tease telephone tempt terrify test thank thaw tick tickle tie time tip tire touch tour tow trace trade train transport trap travel treat tremble trick trip trot trouble trust try tug tumble turn twist type undress unemploy unfasten unite unlock unpack untidy use vanish visit wail wait walk wander want warm warn wash waste watch water wave weigh welcome whine whip whirl whisper whistle wink wipe wish wobble wonder work worry wrap wreck wrestle wriggle yawn yell zip zoom".split(" "),irregular:"abide abode/abided abode/abided/abidden abides abiding\talight alit/alighted alit/alighted alights alighting\tarise arose arisen arises arising\tawake awoke awoken awakes awaking\tbe was/were been is being\tbear bore born/borne bears bearing\tbeat beat beaten beats beating\tbecome became become becomes becoming\tbegin began begun begins beginning\tbehold beheld beheld beholds beholding\tbend bent bent bends bending\tbet bet bet bets betting\tbid bade bidden bids bidding\tbid bid bid bids bidding\tbind bound bound binds binding\tbite bit bitten bites biting\tbleed bled bled bleeds bleeding\tblow blew blown blows blowing\tbreak broke broken breaks breaking\tbreed bred bred breeds breeding\tbring brought brought brings bringing\tbroadcast broadcast/broadcasted broadcast/broadcasted broadcasts broadcasting\tbuild built built builds building\tburn burnt/burned burnt/burned burns burning\tburst burst burst bursts bursting\tbust bust bust busts busting\tbuy bought bought buys buying\tcast cast cast casts casting\tcatch caught caught catches catching\tchoose chose chosen chooses choosing\tclap clapped/clapt clapped/clapt claps clapping\tcling clung clung clings clinging\tclothe clad/clothed clad/clothed clothes clothing\tcome came come comes coming\tcost cost cost costs costing\tcreep crept crept creeps creeping\tcut cut cut cuts cutting\tdare dared/durst dared dares daring\tdeal dealt dealt deals dealing\tdig dug dug digs digging\tdive dived/dove dived dives diving\tdo did done does doing\tdraw drew drawn draws drawing\tdream dreamt/dreamed dreamt/dreamed dreams dreaming\tdrink drank drunk drinks drinking\tdrive drove driven drives driving\tdwell dwelt dwelt dwells dwelling\teat ate eaten eats eating\tfall fell fallen falls falling\tfeed fed fed feeds feeding\tfeel felt felt feels feeling\tfight fought fought fights fighting\tfind found found finds finding\tfit fit/fitted fit/fitted fits fitting\tflee fled fled flees fleeing\tfling flung flung flings flinging\tfly flew flown flies flying\tforbid forbade/forbad forbidden forbids forbidding\tforecast forecast/forecasted forecast/forecasted forecasts forecasting\tforesee foresaw foreseen foresees foreseeing\tforetell foretold foretold foretells foretelling\tforget forgot forgotten forgets foregetting\tforgive forgave forgiven forgives forgiving\tforsake forsook forsaken forsakes forsaking\tfreeze froze frozen freezes freezing\tfrostbite frostbit frostbitten frostbites frostbiting\tget got got/gotten gets getting\tgive gave given gives giving\tgo went gone/been goes going\tgrind ground ground grinds grinding\tgrow grew grown grows growing\thandwrite handwrote handwritten handwrites handwriting\thang hung/hanged hung/hanged hangs hanging\thave had had has having\thear heard heard hears hearing\thide hid hidden hides hiding\thit hit hit hits hitting\thold held held holds holding\thurt hurt hurt hurts hurting\tinlay inlaid inlaid inlays inlaying\tinput input/inputted input/inputted inputs inputting\tinterlay interlaid interlaid interlays interlaying\tkeep kept kept keeps keeping\tkneel knelt/kneeled knelt/kneeled kneels kneeling\tknit knit/knitted knit/knitted knits knitting\tknow knew known knows knowing\tlay laid laid lays laying\tlead led led leads leading\tlean leant/leaned leant/leaned leans leaning\tleap leapt/leaped leapt/leaped leaps leaping\tlearn learnt/learned learnt/learned learns learning\tleave left left leaves leaving\tlend lent lent lends lending\tlet let let lets letting\tlie lay lain lies lying\tlight lit lit lights lighting\tlose lost lost loses losing\tmake made made makes making\tmean meant meant means meaning\tmeet met met meets meeting\tmelt melted molten/melted melts melting\tmislead misled misled misleads misleading\tmistake mistook mistaken mistakes mistaking\tmisunderstand misunderstood misunderstood misunderstands misunderstanding\tmiswed miswed/miswedded miswed/miswedded misweds miswedding\tmow mowed mown mows mowing\toverdraw overdrew overdrawn overdraws overdrawing\toverhear overheard overheard overhears overhearing\tovertake overtook overtaken overtakes overtaking\tpay paid paid pays paying\tpreset preset preset presets presetting\tprove proved proven/proved proves proving\tput put put puts putting\tquit quit quit quits quitting\tre-prove re-proved re-proven/re-proved re-proves re-proving\tread read read reads reading\trid rid/ridded rid/ridded rids ridding\tride rode ridden rides riding\tring rang rung rings ringing\trise rose risen rises rising\trive rived riven/rived rives riving\trun ran run runs running\tsay said said says saying\tsee saw seen sees seeing\tseek sought sought seeks seeking\tsell sold sold sells selling\tsend sent sent sends sending\tset set set sets setting\tsew sewed sewn/sewed sews sewing\tshake shook shaken shakes shaking\tshave shaved shaven/shaved shaves shaving\tshear shore/sheared shorn/sheared shears shearing\tshed shed shed sheds shedding\tshine shone shone shines shining\tshoe shod shod shoes shoeing\tshoot shot shot shoots shooting\tshow showed shown shows showing\tshrink shrank shrunk shrinks shrinking\tshut shut shut shuts shutting\tsing sang sung sings singing\tsink sank sunk sinks sinking\tsit sat sat sits sitting\tslay slew slain slays slaying\tsleep slept slept sleeps sleeping\tslide slid slid/slidden slides sliding\tsling slung slung slings slinging\tslink slunk slunk slinks slinking\tslit slit slit slits slitting\tsmell smelt/smelled smelt/smelled smells smelling\tsneak sneaked/snuck sneaked/snuck sneaks sneaking\tsoothsay soothsaid soothsaid soothsays soothsaying\tsow sowed sown sows sowing\tspeak spoke spoken speaks speaking\tspeed sped/speeded sped/speeded speeds speeding\tspell spelt/spelled spelt/spelled spells spelling\tspend spent spent spends spending\tspill spilt/spilled spilt/spilled spills spilling\tspin span/spun spun spins spinning\tspit spat/spit spat/spit spits spitting\tsplit split split splits splitting\tspoil spoilt/spoiled spoilt/spoiled spoils spoiling\tspread spread spread spreads spreading\tspring sprang sprung springs springing\tstand stood stood stands standing\tsteal stole stolen steals stealing\tstick stuck stuck sticks sticking\tsting stung stung stings stinging\tstink stank stunk stinks stinking\tstride strode/strided stridden strides striding\tstrike struck struck/stricken strikes striking\tstring strung strung strings stringing\tstrip stript/stripped stript/stripped strips stripping\tstrive strove striven strives striving\tsublet sublet sublet sublets subletting\tsunburn sunburned/sunburnt sunburned/sunburnt sunburns sunburning\tswear swore sworn swears swearing\tsweat sweat/sweated sweat/sweated sweats sweating\tsweep swept/sweeped swept/sweeped sweeps sweeping\tswell swelled swollen swells swelling\tswim swam swum swims swimming\tswing swung swung swings swinging\ttake took taken takes taking\tteach taught taught teaches teaching\ttear tore torn tears tearing\ttell told told tells telling\tthink thought thought thinks thinking\tthrive throve/thrived thriven/thrived thrives thriving\tthrow threw thrown throws throwing\tthrust thrust thrust thrusts thrusting\ttread trod trodden treads treading\tundergo underwent undergone undergoes undergoing\tunderstand understood understood understands understanding\tundertake undertook undertaken undertakes undertaking\tupsell upsold upsold upsells upselling\tupset upset upset upsets upsetting\tvex vext/vexed vext/vexed vexes vexing\twake woke woken wakes waking\twear wore worn wears wearing\tweave wove woven weaves weaving\twed wed/wedded wed/wedded weds wedding\tweep wept wept weeps weeping\twend wended/went wended/went wends wending\twet wet/wetted wet/wetted wets wetting\twin won won wins winning\twind wound wound winds winding\twithdraw withdrew withdrawn withdraws withdrawing\twithhold withheld withheld withholds withholding\twithstand withstood withstood withstands withstanding\twring wrung wrung wrings wringing\twrite wrote written writes writing\tzinc zinced/zincked zinced/zincked zincs/zincks zincking".split("\t").map(function(t){return t.split(" ")}),infinitives:[],ing_excpt:["anything","spring","something","thing","king","nothing"],ing_test:[],emphasis:["totally","fully","really","surprisingly","absolutely","actively","clearly","crazily","greatly","happily","notably","severly","particularly","highly","quite","pretty","seriously","very","horribly","even","overly","extremely"],abbrs:["jr","junior","mr","mister","mrs","missus","ms","miss","dr","doctor","prof","professor","pr","professor","sr","senior","sen","senator","sens","senators","corp","corporation","rep","","gov","governor","atty","attorney","supt","superintendent","det","detective","rev","","col","colonel","gen","general","lt","lieutenant","cmdr","commander","adm","administrative","capt","captain","sgt","sergent","cpl","caporal","maj","","esq","esquire","phd","","adj","adjective","adv","adverb","asst","assistant","bldg","building","brig","brigade","hon","","messrs","messeurs","mlle","mademoiselle","mme","madame","ord","order","pvt","private","reps","","res","","sfc","","surg","surgeon","ph","","ds","","ave","avenue","blvd","boulevard","cl","","ct","","cres","","exp","","rd","road","st","street","mt","mount","ft","","fy","","hwy","highway","la","","pd","","pl","","plz","","tce","","vs","","etc","","esp","","llb","","md","","bl","","ma","","ba","","lit","","fl","","ex","example","eg","","ala","alabama","al","alabama","ariz","arizona","ark","arkansas","cal","california","calif","california","col","coloradoa","colo","colorado","conn","connecticut","del","delaware","fed","federal","fla","florida","ga","georgia","ida","idaho","id","idaho","ill","illinois","ind","indiana","ia","iowa","kan","kansas","kans","kansas","ken","kentuky","ky","kentuky","la","","md","","mass","massachussets","mich","michigan","minn","minnesota","miss","mississippi","mo","missouri","mont","montana","neb","nebraska","nebr","nebraska","nev","nevada","mex","mexico","okla","oklahoma","ok","oklahoma","ore","oregon","penna","pennsylvania","penn","pennsylvania","pa","pennsylvania","dak","dakota","tenn","tennessee","tex","texas","ut","utah","vt","vermont","va","virginia","wash","washington","wis","wisconsin","wisc","wisconsin","wy","wyoming","wyo","wyoming","alta","alberta","ont","ontario","que","quebec","sask","saskatchewan","yuk","yukon","jan","january","feb","february","mar","march","apr","april","jun","june","jul","july","aug","august","sep","september","oct","october","nov","november","dec","december","sept","september","dept","department","univ","university","assn","association","bros","brothers","inc","incorported","ltd","limited","co",""],synonyms:"no nah nope n\tyes yeah yep yup y yah aye yea\tseriously srlsy\tok k okay o.k. oki okey-dokey okey-doke\tthem 'em\tyou ya ye\tyour yo\tbecause cuz\tplease plz\tthis dis\ttomorrow 2moro\ttonight 2nite\ttoday 2day\tgreat gr8\tlater l8r\tthanks thx thks tx\tare 're\tam 'm\thello hi\tlove <3\t",abbrs_rplt:[],exclamations:["yahoo","joomla","jeopardy"],rules:"VBP VB 13 MD\tVBZ POS 8 NN 's\tVBZ POS 8 NNS 's\tVBZ POS 8 NNP 's\tVBZ POS 8 NNPS 's\tVBZ POS 8 VB 's\tNNS POS 8 VB 's\tNNS POS 8 NN '\tNNS POS 8 NNS '\tNNS POS 8 NNP '\tNNS POS 8 NNPS '\tNNS POS 8 NN 's\tNNS POS 8 NNS 's\tNNS POS 8 NNP 's\tNNS POS 8 NNPS 's\tRB DT 8 VBN no\tRB DT 8 VBG no\tRB DT 8 VBD no\tRB DT 8 VBP no\tRB DT 8 VB no\tRB DT 8 RB no\tIN RP 8 VB out\tIN RP 8 VBZ out\tIN RP 8 VBG out\tIN RP 8 VBN out\tIN RP 8 VBP out\tIN RP 8 VB off\tIN RP 8 VBZ off\tIN RP 8 VBG off\tIN RP 8 VBN off\tIN RP 8 VBP off\tRB DT 8 VBD no\tRB DT 8 IN no\tVBZ NNS 2 PRP$\tVBZ NNS 2 WP$\tVBZ NNS 2 VBZ\tVBZ NNS 2 VBP\tVBZ NNS 2 JJ\tVBZ NNS 2 JJS\tVBZ NNS 2 JJR\tVBZ NNS 2 POS\tVBZ NNS 2 CD\tVBZ NNS 51 the DT\tVBZ NNS 15 is\tVBZ NNS 15 are\tVBZ NNS 5 the\tVBZ NNS 5 those\tVBZ NNS 5 these\tVB VBP 8 NNP have\tVB VBP 8 EX have\tVB VBP 8 RB have\tVB VBP 8 RBR have\tIN WDT 8 NNS that\tVBP IN 8 JJR like\tVBP IN 8 RBR like\tVBP IN 8 VBD like\tVBP IN 8 VBN like\tVBP IN 8 RB like\tVBP IN 8 VBZ like\tJJ JJS 8 DT latest\tPRP$ PRP 8 VBD her\tJJ NN 8 CD fine\tJJ RB 8 IN much\tNNP MD 8 PRP may\tNNP MD 8 NNP may\tNNP MD 8 NN may\tNNP MD 8 NNS may\tNNP MD 8 CC may\tJJ NN 8 CC chief\tJJ VB 8 TO slow\tJJ VB 8 MD slow\tVB NN 2 DT\tVB NN 2 JJR\tVB NN 2 JJ\tVB NN 2 NN\tVB NN 2 IN\tVB NN 2 SYM\tVB NN 2 VBD\tVB NN 2 VBN\tVB NN 172 MD VB NN\tVB NN 172 MD VB IN\tNN VB 1 MD\tNN VB 172 VBN TO $\tNN VB 172 NNS TO JJ\tNN VBG 2 PRP\tNNP MD 12 may VB\tVBD VBN 21 be\tJJR RBR 3 JJ\tJJS RBS 12 most JJ\tNN RB 121 kind of\tJJ IN 8 NNP in\tRB DT 8 VBZ no\tJJ IN 8 NN in\tJJ IN 8 JJ in\tJJ IN 8 RB in\tJJ IN 8 VB in\tJJ IN 8 NNS in\tJJ IN 8 VBN in\tJJ IN 8 CD in\tIN RB 12 as RB\tWRB RB 12 when PRP\tWRB RB 8 IN how\tJJ RB 8 RB much\tJJR RBR 12 more JJ\tIN RP 8 VBD up\tIN RB 8 CD up\tIN RB 8 NN up\tRP RB 8 VBD up\tIN RP 8 VB up\tRB RP 8 VB back\tRB RP 8 VBD back\tRB RP 8 VBG back\tRB IN 81 years ago\tRB IN 81 year ago\tIN WDT 8 NN that\tRB WRB 12 when PRP\tIN DT 12 that NN\tWDT IN 12 that NN\tWDT IN 12 that DT\tWDT IN 12 that PRP\tWRB RB 12 when DT\tVB NN 3 VBZ +\tVBG MD 6 'll\tVBG MD 6 wo\tVBD VBN 13 VBZ\tVBN VBD 3 .\tVBN VBD 3 DT\tVBG VBP 2 PRP\tVBN VBD 2 PRP\tVBN VBD 2 NNP\tVBN VBD 2 NN\tVBN VBD 2 NNS\tVBN VBD 2 WP\tVBN VBD 14 NN RB\tVBN VBD 14 PRP DT\tVBD VBN 2 VBD\tVBD VBN 2 VB\tVBD VBN 2 VBG\tVBD VBN 2 VBZ\tVBD VBN 2 VBZ\tVBD VBN 2 VBP\tVBD VBN 14 RB TO\tVBD VBN 14 VBZ JJ\tVBD VBN 14 VBP JJ\tVBD VBN 171 TO PRP\tVBD VBN 15 by\tVBN VBD 15 that\tVBN VBD 5 which\tVBD VBN 5 has\tVBD VBN 13 VBD\tVB VBN 5 has\tVBD VBN 17 MD\tVBG NN 2 DT\tVBG NN 2 JJ\tVBG NN 2 PRP$\tRBS JJS 2 IN\tNN VB 14 TO DT\tNN VB 14 TO IN\tVB VBP 14 PRP DT\tVB VBP 14 PRP IN\tVBP VB 14 MD VBN\tMD VBG 14 VBZ TO\tMD VBG 14 VBP TO\tVBP VB 14 MD TO\tVBP VB 14 TO DT\tVBN VBD 14 PRP PRP\tVB VBD 14 PRP TO\tVBN VBD 14 NNP DT\tVB VBP 14 PRP PRP\tVB VBP 2 NNS\tVBP VB 51 to TO\tNNS NN 51 a DT\tWRB RB 51 and CC\tVBP VB 81 may have\tVBP MD 6 gon\tVBP VB 8 MD have\tNNS VBZ 8 PRP plans\tNNS VBZ 8 NN plans\tNNS VBZ 8 NNP plans\tNNS VBZ 8 NNPS plans\tRB NNP 12 south NNP\tRB NNP 12 east NNP\tRB NNP 12 west NNP\tRB NNP 12 north NNP\tFW NNP 12 la NNP\tJJ NNP 12 american NNP\tVBN NNP 12 united NNP\tWRB RB 12 when NN\tWRB RB 12 when NNS\tWRB RB 12 when NNP\tWRB RB 12 when NNPS\tWRB RB 12 where NN\tWRB RB 12 where NNS\tWRB RB 12 where NNP\tWRB RB 12 where NNPS\tWRB RB 12 when PRP\tRBR JJR 81 year earlier\tRBR JJR 81 years earlier\tNN VB 14 TO VBZ\tVBG NN 2 JJR\tCD NN 8 DT one\tCD PRP 12 one VBZ\tNNS VBZ 2 PRP\tVB VBP 2 WDT\tVB VBP 2 WP\tVB VBP 2 PRP\tVBZ NNS 2 VBG\tVBZ NNS 2 VBN\tVBZ NNS 2 VBD\tNNS VBZ 2 WDT\tNNS VBZ 2 WP\tVBZ NNS 2 IN\tWDT IN 12 that DT\tIN WDT 12 that VBP\tNN UH 12 hell UH\tNN UH 12 hell RB\tVB NN 8 PRP$ bid\tVBN JJ 51 is VBZ\tVBN JJ 51 are VBP\tVBN JJ 14 NN JJ\tVBN JJ 14 RB NN\tNN VB 5 will\tJJ VB 5 will\tNN NNP 5 mr.\tNNS VBZ 6 has\tVB NN 5 the\tVBD VBN 15 with\tVBN VBD 6 was\tNNS VBZ 6 is\tNN VBP 6 have\tVBD VBP 6 have\tVBN VBD 6 were\tCD NN 81 no one\tVBG JJ 14 , JJ\tVBG JJ 14 DT JJ\tVBG JJ 14 , NN\tVBG JJ 14 DT NN\tNNS VBZ 8 WDT 's\tNNS VBZ 8 DT 's\tNNS VBZ 8 IN 's\tNNP UH 0 RT\tNNP UH 0 MT\tJJ VBN 14 VBZ IN\tJJ NN 14 DT IN\tJJ VBN 14 VBP IN\tNN JJ 6 first\tNN JJ 6 last\tNN JJ 6 high\tNN JJ 6 low\tNN JJ 6 middle\t",suffixes:"rate VB\trates VBZ\tlate VB\tlates VBZ\tnate VB\tnates VBZ\tizes VBZ\tize VB\tify VB\tifies VBZ\tising VBG\tism NN\table JJ\tible JJ\tical JJ\tesque JJ\tous JJ \tetic JJ\tatic JJ\tegic JJ\tophic JJ\tish JJ\tive JJ\tgic JJ\ttic JJ\tmic JJ\tphile JJ\tless JJ\tful JJ\tedelic JJ\tadelic JJ\taholic JJ\toholic JJ\tilar JJ\tular JJ\tly RB\tlike JJ\twise RB\tise VB\tsome JJ\tescent JJ\tchy JJ\tthy JJ\tshy JJ\tsty JJ\ttty JJ\tbby JJ\tssy JJ\tzzy JJ\tmmy JJ\tppy JJ\ttary JJ\tnary JJ\tial JJ\talous JJ\tally RB\tvid JJ\trid JJ\twards RB\tiest JJS\tdest JJS\trth JJ",emots:[],floatChar:".",thousandChar:",",multipliers:["hundred","thousand","million","billion","trillion"],numbers:{zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,ninteen:19,twenty:20,thirty:30,forty:40,fourty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,thousand:1e3,million:1e6,billion:1e9,trillion:1e12},nationalities:"afghan albanian algerian argentine armenian australian aussie austrian bangladeshi belgian bolivian bosnian brazilian bulgarian cambodian canadian chilean chinese colombian croat cuban czech dominican egyptian british estonian ethiopian finnish french gambian georgian german greek haitian hungarian indian indonesian iranian iraqi irish israeli italian jamaican japanese jordanian kenyan korean kuwaiti latvian lebanese liberian libyan lithuanian macedonian malaysian mexican mongolian moroccan dutch nicaraguan nigerian norwegian omani pakistani palestinian filipino polish portuguese qatari romanian russian rwandan samoan saudi scottish senegalese serbian singaporean slovak somali sudanese swedish swiss syrian taiwanese thai tunisian ugandan ukrainian american hindi spanish venezuelan vietnamese welsh african european asian californian",neg:{zero:"CD",without:"IN",except:"IN",absent:"JJ",unlike:"IN",unable:"JJ",unremarkable:"JJ",unlikely:"JJ",negative:"JJ",hardly:"RB",deny:"VB",fail:"VB",exclude:"VB",lack:"NN",absence:"NN",none:"NN",nothing:"NN"},neg_neg:{only:"RB",just:"RB",solely:"RB",uniquely:"RB",exclusively:"RB"},refusal:{not:"RB","n't":"RB","'t":"RB",no:"RB",neither:"DT",nor:"DT",never:"RB"},approval:{yes:"UH",ok:"NN",agreed:"VBN",agree:"VBP",affirmative:"JJ",approved:"VBN",sure:"JJ",roger:"NN",indeed:"RB",right:"NN",alright:"JJ"},approval_verbs:["go","do"],breakpoints:{},citations:{'"':'"',"'":'"',"`":'"'},p:{i:"PRP",you:"PRP"},months:{january:"NNP",february:"NNP",march:"NNP",april:"NNP",may:"NNP",june:"NNP",july:"NNP",august:"NNP",september:"NNP",october:"NNP",november:"NNP",december:"NNP"},days:{monday:"NNP",tuesday:"NNP",wednesday:"NNP",thursday:"NNP",friday:"NNP",saturday:"NNP",sunday:"NNP"},indicators:{first:"JJ",both:"DT",second:"JJ",third:"JJ",last:"JJ",previous:"JJ",next:"JJ",latest:"JJ",earliest:"JJ"},dirty:"anal anus arse ass asshole ballsack bastard bitch biatch bloody blowjob bollock bollok boner boob bugger bum butt buttplug clitoris cock coon crap cunt damn dick dildo dyke fag feck fellate fellatio felching fuck fucking fudgepacker fudgepacker flange homo jerk jizz knobend knobend labia lmfao muff nigger nigga penis piss poop prick pube pussy queer scrotum sex shit sh1t slut smegma spunk tit tosser turd twat vagina wank whore crappy".split(" "),
polite:"thanks thank please excuse pardon welcome sorry might ought".split(" ")})}(),!function(){var e=t.inflector,i=function(i){var s,r,a,o,J,l,d,N,c,p,B,g=(Date.now(),i.split("\t")),V={},h=[];for(s=0,a=g.length;s<a;s++)B=g[s].split(" "),J=!1,p=B.length-1,d=p>0?B[1].trim():"",o=d.length-1,o>0&&"-"===d[o]&&(J=!0,d=d.slice(0,o)),N=0,c=null,B[p].match(/^[A-Z]{2,}\/[0-9\-]+$/g)?(c=B[p].split("/")[0],N=B[p].split("/")[1]):(B[p].match(/^[0-9\-]+$/g)||B[p].match(/^\-{0,1}[0-4]\.[0-9]$/g))&&(N=B[p].indexOf(".")>0?parseFloat(B[p]):parseInt(B[p],10)),"EM"===d&&t.punycode.ucs2.decode(B[0]).length>1&&h.push(B[0]),V[B[0]]={pos:"-"===d?"NN":d,sentiment:N,condition:c,blocked:J};for(s in n)if(n.hasOwnProperty(s)&&"object"==typeof n[s]&&!u(n[s])){B=n[s];for(a in B)B.hasOwnProperty(a)&&(N=0,"string"==typeof B[a]?(V.hasOwnProperty(a)&&(N=V[a].sentiment),V[a]={pos:B[a],sentiment:N,condition:null}):"number"==typeof B[a]&&(V[a]={pos:"CD",sentiment:N,value:B[a],condition:null}))}for(s=0,a=n.verbs.length;s<a;s++,N=0)B=n.verbs[s],n.infinitives.push(B),l=e.conjugate(B,"VBZ"),l&&(V.hasOwnProperty(B)&&("NN"===V[B].pos&&(V[B].pos="VB"),J=V[B].blocked,N=V[B].sentiment),V[l]={pos:"VBZ",sentiment:N,condition:null,infinitive:B,blocked:J},l=e.conjugate(B,"VBN"),V.hasOwnProperty(l)?V[l].infinitive=B:V[l]={pos:"VBN",sentiment:N,condition:null,infinitive:B},l=e.conjugate(B,"VBG"),V.hasOwnProperty(l)?V[l].infinitive=B:V[l]={pos:"VBG",sentiment:N,condition:null,infinitive:B});for(s=0,a=n.irregular.length;s<a;s++,N=0)for(B=n.irregular[s],p=B[0],V.hasOwnProperty(p)&&(N=V[p].sentiment,"VB"!==V[p].pos&&(V[p].pos="VB")),n.infinitives.push(p),r=0;r<5;r++)B[r].split("/").map(function(t){V.hasOwnProperty(t)?V[t].infinitive||(V[t].infinitive=p,V[t].sentiment=N):V[t]={pos:0===r?"VB":1===r?"VBD":2===r?"VBN":3===r?"VBZ":"VBG",sentiment:N,condition:null,infinitive:p}});return n.emots=h,V},s=function(t){t=t.split("\t");var e,i,s,r=[],a=t.length;for(s=0;s<a;s++)e=t[s].split(" "),"+"===e[e.length-1]?(e.splice(e.length-1,1),i=!0):i=!1,r.push({from:e[0],to:e[1],type:parseInt(e[2],10),c1:e[3],c2:e[4],c3:e[5],secondRun:i});n.rules=r},r=function(t){t=t.split("\t");var e,i,s=t.length,r=[];for(e=0;e<s;e++)i=t[e].split(" "),r.push({regexp:new RegExp("^.{1,}"+i[0].trim()+"$","gi"),pos:i[1]});n.suffixes=r},a=function(t){var i,n=t.length;for(i=0;i<n;i++)t.push(e.pluralize(t[i]))},o=function(t){var e,i=t.length,s=[],r=[];for(e=0;e<i;e++)e%2===0?s.push(t[e]):r.push(t[e]);n.abbrs=s,n.abbrs_rplt=r},J=function(t){var e,i,s={};for(t=t.split(" "),e=0,i=t.length;e<i;e++)s[t[e]]="JJ";n.nationalities=s},l=function(t){t=t.split("\t");var e,i=t.length,s=[];for(e=0;e<i;e++)s.push(t[e].split(" "));n.synonyms=s};s(n.rules),r(n.suffixes),o(n.abbrs),a(n.dirty),l(n.synonyms),J(n.nationalities),t.lexicon=i("! !\t# #\t... ...\t$ $\t€ $\t£ $\t¥ $\t%... :\t& CC\t( (\t) )\t* SYM\t+ SYM\t, ,\t. .\t: :\t; ;\t< SYM\t= SYM\t> SYM\t? .\t@ IN\ta DT\tabandon VB -2\tabandoned VBN -2\tabandons VBZ -2\tabducted VBN -2\tabduction NN -2\tabhor VB -3\tabhorred VBD -3\tabhorrent JJ -3\tability NN 2\table JJ\taboard IN 1\taboriginal JJ\tabout IN\tabove IN\tabroad RB\tabsentee JJ -1\tabsolute JJ\tabsolve VBP 2\tabsolved VBD 2\tabsolving VBG 2\tabsorbed VBN 1\tabstract JJ\tabuse NN -3\tabused VBN -3\tabusive JJ -3\taccept VB 1\taccepted VBN 1\taccepting VBG 1\taccepts VBZ 1\taccident NN -2\taccidental JJ -2\taccidentally RB -2\taccommodate VB\taccomplish VB 2\taccomplished VBN 2\taccomplishes VBZ 2\taccurate JJ 1\taccusation NN -2\taccuse VB -2\taccused VBN -2\taccuses VBZ -2\taccusing VBG -2\tache NN -2\tachievable JJ 1\tachieve VB\taching VBG -2\tacknowledge VBP\tacquire VB\tacquit VB 2\tacquitted VBN 2\tacrimonious JJ -3\tacross IN\tactive JJ 1\tactual JJ\tacute JJ\tadditional JJ\tadequate JJ 1\tadjacent JJ\tadjust VB\tadmire VB 3\tadmired VBD 3\tadmires VBZ 3\tadmiring VBG 3\tadmit VB -1\tadmits VBZ -1\tadmitted VBD -1\tadmonished VBD -2\tadopt VB 1\tadopts VBZ 1\tadorable JJ 3\tadore VBP 3\tadored VBD 3\tadores VBZ 3\tadvanced VBD 1\tadvantage NN 2\tadventure NN 2\tadventurous JJ 2\tadverse JJ\tadvisory JJ\taffect VB\taffected VBN -1\taffection NN 3\taffectionate JJ 3\tafflicted VBN -1\taffronted VBN -1\tafraid JJ -2\tafter IN\tagain RB\tagainst IN\taggravate VBP -2\taggravated VBN -2\taggravates VBZ -2\taggravating VBG -2\taggregate JJ\taggression NN -2\taggressive JJ -2\taghast JJ -2\tago RB\tagonize VB -3\tagonized VBD -3\tagonizes VBZ -3\tagonizing JJ -3\tagree VB 1\tagreeable JJ 2\tagreed VBD 1\tagreement NN 1\tagrees VBZ 1\tagricultural JJ\tah UH\tahead RB\tai VBP\talarm NN -2\talarmed VBN -2\talarmist JJ -2\talas UH -1\talert JJ -1\talien JJ\talienation NN -2\talign VB\talike RB\talive JJ 1\tall DT\tallergic JJ -2\tallow VB 1\talmost RB\talone RB -2\talong IN\talpha JJ\talready RB\talso RB\talter VB\talternate JJ\talthough IN\talways RB\tam VBP\tamaze VB 2\tamazed VBN 2\tamazing JJ 4\tamber JJ\tambitious JJ 2\tambivalent JJ -1\tamend VB\tamino JJ\tamong IN\tamongst IN\tamuse VB 3\tamused VBN 3\tamusement NN 3\tan DT\tancient JJ\tand CC\tanger NN -3\tangers VBZ -3\tangry JJ -3\tanguish NN -3\tanguished JJ -3\tanimated JJ\tanimosity NN -2\tannoy VB -2\tannoyance NN -2\tannoyed VBN -2\tannoying JJ -2\tannoys VBZ -2\tannual JJ\tanother DT\tantagonistic JJ -2\tanti IN -1\tanticipation NN 1\tantique JJ\tanxiety NN -2\tanxious JJ -2\tany DT\tanymore RB\tanytime RB\tanyway RB\tanywhere RB\tapart RB\tapathetic JJ -3\tapathy NN -3\tapocalyptic JJ -2\tapologize VB -1\tapologized VBD -1\tapologizes VBZ -1\tapologizing VBG -1\tapology NN -1\tappalled VBN -2\tappalling JJ -2\tapparent JJ\tappease VB 2\tappeased VBN 2\tappeasing NN 2\tapplaud VBP 2\tapplauded VBD 2\tapplauding VBG 2\tapplauds VBZ 2\tapplause NN 2\tapply VB\tappreciate VB 2\tappreciated VBN 2\tappreciates VBZ 2\tappreciating VBG 2\tappreciation NN 2\tapprehensive JJ -2\tappropriate JJ\tapproval NN 2\tapproved VBD 2\tapproves VBZ 2\tapproximate JJ\tapt JJ\tarabic JJ\tarbitrary JJ\tarchitectural JJ\tardent JJ 1\tare VBP\targue VBP\taround IN\tarrest NN -2\tarrested VBN -3\tarrogant JJ -2\tas IN\tashamed JJ -2\taside RB\tass NN -4\tassassination NN -3\tassess VB\tasset NN 2\tassign VB\tassist VB\tassociate JJ\tassume VB\tassure VB\tastonished VBN 2\tastound VB 3\tastounded VBN 3\tastounding JJ 3\tastoundingly RB 3\tastounds VBZ 3\tat IN\tatmospheric JJ\tattack NN -1\tattacked VBN -1\tattacking VBG -1\tattract VB 1\tattracted VBN 1\tattracting VBG 2\tattraction NN 2\tattracts VBZ 1\tattribute VBP\tau FW\tauburn JJ\taudacious JJ 3\taudio JJ\tauthority NN 1\taverage JJ\tavert VB -1\taverted VBN -1\taverts VBZ -1\tavid JJ 2\tavoid VB -1\tavoided VBN -1\tavoids VBZ -1\taw UH\taww UH 1\tawait VB -1\tawaited VBD -1\tawaits VBZ -1\taward NN 3\tawarded VBN 3\taware JJ\taway RB\tawesome JJ 4\tawful JJ -3\tawkward JJ -2\taxe NN -1\taye RB\tback RB\tbacked VBN 1\tbacking VBG 2\tbad JJ -3\tbadly RB -3\tbailout NN -2\tbalanced JJ\tbald JJ\tbamboozled VBN -2\tban NN -2\tbanish VB -1\tbankrupt JJ -3\tbanned VBN -2\tbare JJ\tbargain NN 2\tbarrier NN -2\tbasic JJ\tbastard NN -5\tbattle NN -1\tbeaten VBN -2\tbeatific JJ 3\tbeating VBG -1\tbeautiful JJ 3\tbeautifully RB 3\tbeautify VBP 3\tbecause IN\tbefore IN\tbehavioral JJ\tbehind IN\tbelieve VBP\tbelittle VBP -2\tbelittled JJ -2\tbelle FW\tbeloved JJ 3\tbelow IN\tbeneath IN\tbenefit NN 2\tbeside IN\tbesides IN\tbest JJS 3\tbetray VB -3\tbetrayal NN -3\tbetrayed VBN -3\tbetraying VBG -3\tbetrays VBZ -3\tbetter JJR 2\tbetween IN\tbeyond IN\tbi IN\tbias NN -1\tbiased VBN -2\tbig JJ 1\tbigger JJR\tbiggest JJS\tbitch NN -5\tbitter JJ -2\tbitterly RB -2\tbizarre JJ -2\tblack JJ\tblame VB -2\tblamed VBD -2\tblames VBZ -2\tblaming VBG -2\tblank JJ\tbless VB 2\tblessing NN 3\tblind JJ -1\tbliss NN 3\tblissful JJ 3\tblithe JJ 2\tblock NN -1\tblockbuster NN 3\tblocked VBN -1\tblocking VBG -1\tblond JJ\tblonde JJ\tbloody JJ -3\tblue JJ\tblurry JJ -2\tblush NN 3\tboastful JJ -2\tbold JJ 2\tboldly RB 2\tbomb NN -1\tbon FW\tboost VB 1\tboosted VBD 1\tboosting VBG 1\tbore VBD -2\tbored VBN -2\tboring JJ -3\tborn VBN\tbother VB -2\tbothered VBN -2\tbothers VBZ -2\tbothersome JJ -2\tboycott NN -2\tboycotted VBN -2\tboycotting VBG -2\tbrainwashing NN -3\tbrave JJ 2\tbreakthrough NN 3\tbreathtaking JJ 5\tbribe NN -3\tbridal JJ\tbrief JJ\tbright JJ 1\tbrightest JJS 2\tbrightness NN 1\tbrilliant JJ 4\tbrisk JJ 2\tbroad JJ\tbroader JJR\tbroke VBD -1\tbroken VBN -1\tbrooding VBG -2\tbrown JJ\tbrowse VB\tbrunette JJ\tbrutal JJ\tbullied VBD -2\tbullshit NN -4\tbully NN -2\tbullying VBG -2\tbuoyant JJ 2\tburden NN -2\tburdened VBN -2\tburdening VBG -2\tburn VB -1\tbusy JJ\tbut CC\tby IN\tbye VB\tca MD\tcalm JJ 2\tcalmed VBD 2\tcalming VBG 2\tcan MD\tcancel VB -1\tcancelled VBN -1\tcancelling VBG -1\tcancels VBZ -1\tcancer NN -1\tcapable JJ 1\tcaptivated VBN 3\tcapture VB\tcardiac JJ\tcare NN 2\tcarefree JJ 1\tcareful JJ 2\tcarefully RB 2\tcareless JJ -2\tcares VBZ 2\tcasual JJ\tcasualty NN -2\tcatastrophe NN -3\tcatastrophic JJ -4\tcautious JJ -1\tcelebrate VB 3\tcelebrated VBD 3\tcelebrates VBZ 3\tcelebrating VBG 3\tcensor VBP -2\tcensored VBN -2\tcentral JJ\tcertain JJ 1\tchagrin NN -2\tchallenge NN -1\tchance NN 2\tchaos NN -2\tchaotic JJ -2\tchar VB\tcharged VBN -3\tcharm NN 3\tcharming JJ 3\tchastised VBD -3\tchastises VBZ -3\tcheap JJ\tcheaper JJR\tcheapest JJS\tcheat VB -3\tcheated VBN -3\tcheater NN -3\tcheats VBZ -3\tcheer NN 2\tcheered VBD 2\tcheerful JJ 2\tcheering VBG 2\tcheery JJ 3\tcherish VB 2\tcherished VBN 2\tcherishes VBZ 2\tcherishing VBG 2\tcherry JJ\tchic JJ 2\tchief JJ\tchildish JJ -2\tchilling VBG -1\tchoke VB -2\tchoked VBD -2\tchoking VBG -2\tchronic JJ\tcite VBP\tcivic JJ\tcivil JJ\tcivilian JJ\tclarifies VBZ 2\tclarity NN 2\tclash NN -2\tclassic JJ\tclassy JJ 3\tclean JJ 2\tcleaner JJR 2\tclear JJ 1\tcleared VBN 1\tclearly RB 1\tclears VBZ 1\tclever JJ 2\tclimb VB\tcloser JJR\tclosest JJS\tclouded VBN -1\tcloudy JJ\tcoastal JJ\tcock NN -5\tcocky JJ -2\tcoerced VBN -2\tcold JJ\tcollapse NN -2\tcollapsed VBD -2\tcollapses VBZ -2\tcollapsing VBG -2\tcollision NN -2\tcolored JJ\tcombat NN -1\tcombine VB\tcomedy NN 1\tcomfort NN 2\tcomfortable JJ 2\tcomforting VBG 2\tcommend VB 2\tcommended VBN 2\tcomment VB\tcommit VB 1\tcommitment NN 2\tcommits VBZ 1\tcommitted VBN 1\tcommitting VBG 1\tcommon JJ\tcommunist JJ\tcompact JJ\tcompassionate JJ 2\tcompelled VBN 1\tcompetent JJ 2\tcompetitive JJ 2\tcompile VB\tcomplacent JJ -2\tcomplain VBP -2\tcomplained VBD -2\tcomplains VBZ -2\tcomplete JJ\tcomplex JJ\tcompliant JJ\tcomply VB\tcomposite JJ\tcomprehensive JJ 2\tcomputational JJ\tcompute VB\tcon JJ\tconceptual JJ\tconciliate VB 2\tconclude VB\tconcrete JJ\tcondemn VB -2\tcondemnation NN -2\tcondemned VBN -2\tcondemns VBZ -2\tconditional JJ\tconfidence NN 2\tconfident JJ 2\tconfirm VB\tconflict NN -2\tconflicting VBG -2\tconfounded VBD -2\tconfuse VB -2\tconfused VBN -2\tconfusing JJ -2\tcongratulate VBP 2\tcongratulation NN 2\tcongressional JJ\tconsent NN 2\tconsistent JJ\tconsole VB\tconsolidated JJ\tconspiracy NN -3\tconstant JJ\tconstitute VBP\tconstitutional JJ\tconstrained VBN -2\tconstruct VB\tconsult VB\tcontagion NN -2\tcontagious JJ -1\tcontemporary JJ\tcontempt NN -2\tcontemptuous JJ -2\tcontemptuously RB -2\tcontend VBP -1\tcontender NN -1\tcontending VBG -1\tcontentious JJ -2\tcontinental JJ\tcontrary JJ\tcontribute VB\tcontroversial JJ -2\tconvenient JJ\tconventional JJ\tconvert VB\tconvince VB 1\tconvinced VBN 1\tconvinces VBZ 1\tconvivial JJ 2\tcool JJ 1\tcooler JJR\tcope VB\tcoral JJ\tcornered VBN -2\tcorporate JJ\tcorpse NN -1\tcorrect JJ\tcorresponding JJ\tcostly JJ -2\tcould MD\tcourage NN 2\tcourageous JJ 2\tcourteous JJ 2\tcourtesy NN 2\tcoward NN -2\tcowardly JJ -2\tcoziness NN 2\tcramp NN -1\tcrap NN -3\tcrash NN -2\tcrazy JJ -2\tcreate VB\tcreative JJ 2\tcrestfallen JJ -2\tcried VBD -2\tcrime NN -3\tcriminal JJ -3\tcrisis NN -3\tcritic NN -2\tcriticism NN -2\tcriticize VB -2\tcriticized VBN -2\tcriticizes VBZ -2\tcriticizing VBG -2\tcruel JJ -3\tcruelty NN -3\tcrush NN -1\tcrushed VBN -2\tcrushes VBZ -1\tcrushing VBG -1\tcry NN -1\tcrying VBG -2\tcubic JJ\tcultural JJ\tcurious JJ 1\tcurrent JJ\tcurse NN -1\tcut VB -1\tcute JJ 2\tcutting VBG -1\tcynic NN -2\tcynical JJ -2\tcynicism NN -2\td FW\tdaily JJ\tdamage NN -3\tdamn JJ -4\tdamned JJ -4\tdamnit UH -4\tdanger NN -2\tdans FW\tdaring JJ 2\tdark JJ\tdarkest JJS -2\tdarkness NN -1\tdauntless JJ 2\tde FW\tdead JJ -3\tdeadlock NN -2\tdeadly JJ\tdeaf JJ\tdeafening VBG -1\tdear JJ 2\tdearly RB 3\tdeath NN -2\tdebonair JJ 2\tdebt NN -2\tdeceit NN -3\tdeceitful JJ -3\tdeceive VB -3\tdeceived VBN -3\tdeceives VBZ -3\tdeceiving VBG -3\tdecent JJ\tdeception NN -3\tdecisive JJ 1\tdeclare VB\tdedicated VBN 2\tdeep JJ\tdeeper JJR\tdef JJ\tdefeated VBN -2\tdefect NN -3\tdefend VB\tdefender NN 2\tdefenseless JJ -2\tdefer VB -1\tdeferring VBG -1\tdefiant JJ -1\tdeficit NN -2\tdefine VB\tdegrade VB -2\tdegraded JJ -2\tdehumanize VB -2\tdehumanized VBN -2\tdelay NN -1\tdelayed VBN -1\tdelete VB\tdelight NN 3\tdelighted VBN 3\tdelighting VBG 3\tdelights VBZ 3\tdeluxe JJ\tdemand NN -1\tdemanded VBD -1\tdemanding VBG -1\tdemographic JJ\tdemonstration NN -1\tdemoralized VBN -2\tdenied VBN -2\tdenies VBZ -2\tdenounce VBP -2\tdenounces VBZ -2\tdense JJ\tdental JJ\tdeny VB -2\tdenying VBG -2\tdepartmental JJ\tdependent JJ\tdepressed JJ -2\tdepressing JJ -2\tderail VB -2\tderailed VBD -2\tderide VBP -2\tderided VBD -2\tderision NN -2\tdeserve VBP\tdesirable JJ 2\tdesire NN 1\tdesired VBN 2\tdesirous JJ 2\tdespair NN -3\tdespairing JJ -3\tdespairs VBZ -3\tdesperate JJ -3\tdesperately RB -3\tdespite IN\tdespondent JJ -3\tdestroy VB -3\tdestroyed VBN -3\tdestroying VBG -3\tdestroys VBZ -3\tdestruction NN -3\tdestructive JJ -3\tdetached VBN -1\tdetain VB -2\tdetained VBN -2\tdetention NN -2\tdetermine VB\tdetermined VBN 2\tdevastate VB -2\tdevastated VBN -2\tdevastating JJ -2\tdevelopmental JJ\tdeviant JJ\tdevoted VBN 3\tdiamond NN 1\tdie VB -3\tdied VBD -3\tdiffer VBP\tdifferent JJ\tdifficult JJ -1\tdigest VB\tdigital JJ\tdilemma NN -1\tdim JJ\tdimensional JJ\tdire JJ -3\tdirect JJ\tdirt NN -2\tdirtier JJR -2\tdirtiest JJS -2\tdirty JJ -2\tdisable VB\tdisabled JJ\tdisabling VBG -1\tdisadvantage NN -2\tdisadvantaged JJ -2\tdisagree VBP\tdisappear VB -1\tdisappeared VBD -1\tdisappears VBZ -1\tdisappoint VB -2\tdisappointed VBN -2\tdisappointing JJ -2\tdisappointment NN -2\tdisappoints VBZ -2\tdisaster NN -2\tdisastrous JJ -3\tdisbelieve VB -2\tdiscard VB -1\tdiscarded VBN -1\tdisclose VB\tdiscontented JJ -2\tdiscord NN -2\tdiscounted VBN -1\tdiscouraged VBN -2\tdiscredited VBN -2\tdiscrete JJ\tdiscuss VB\tdisdain NN -2\tdisgrace NN -2\tdisgraced VBN -2\tdisguise VB -1\tdisguised VBN -1\tdisguises VBZ -1\tdisgust NN -3\tdisgusted VBN -3\tdisgusting JJ -3\tdisheartened VBN -2\tdishonest JJ -2\tdisillusioned VBN -2\tdisinclined VBN -2\tdisjointed VBN -2\tdislike NN -2\tdismal JJ -2\tdismayed VBN -2\tdisorder NN -2\tdisorganized JJ -2\tdisoriented VBN -2\tdisparage VB -2\tdisparaged VBD -2\tdisparaging VBG -2\tdispleased VBN -2\tdispute NN -2\tdisputed VBN -2\tdisqualified VBN -2\tdisquiet NN -2\tdisregard NN -2\tdisregarded VBD -2\tdisregarding VBG -2\tdisrespect NN -2\tdisruption NN -2\tdisruptive JJ -2\tdissatisfied JJ -2\tdistant JJ\tdistinct JJ\tdistort VB -2\tdistorted VBN -2\tdistorting VBG -2\tdistorts VBZ -2\tdistract VB -2\tdistracted VBN -2\tdistraction NN -2\tdistress NN -2\tdistressed JJ -2\tdistressing JJ -2\tdistribute VB\tdistrust NN -3\tdisturb VB -2\tdisturbed VBN -2\tdisturbing JJ -2\tdisturbs VBZ -2\tdithering VBG -2\tdiverse JJ\tdivine JJ\tdizzy JJ -1\tdodge VBP\tdodging VBG -2\tdominant JJ\tdon VB\tdoom NN -2\tdoomed VBN -2\tdouble JJ\tdoubt NN -1\tdoubted VBD -1\tdoubtful JJ -1\tdoubting VBG -1\tdown RB\tdowncast JJ -2\tdownside NN -2\tdrag NN -1\tdragged VBN -1\tdrags VBZ -1\tdrained VBN -2\tdread NN -2\tdreaded VBN -2\tdreadful JJ -3\tdreading VBG -2\tdream NN 1\tdreary JJ -2\tdrop NN -1\tdrown VB -2\tdrowned VBN -2\tdrowns VBZ -2\tdrunk JJ -2\tdry JJ\tdual JJ\tdubious JJ -2\tdud NN -2\tdue JJ\tdull JJ -2\tdumb JJ -3\tdump VB -1\tdumped VBD -2\tdumps VBZ -1\tduped VBN -2\tduplicate VB\tduring IN\tdysfunction NN -2\teach DT\teager JJ 2\tearlier RBR\tearly JJ\tearn VB 1\tearnest NN 2\tease VB 2\teasier JJR\teasily RB 1\teast JJ\teastern JJ\teasy JJ 1\teclipse VB\tecstatic JJ 4\tedit VB\teducational JJ\teerie JJ -2\teffective JJ 2\teffectively RB 2\tefficient JJ\teh UH\teither DT\telated JJ 3\telation NN 3\telder JJR\telderly JJ\telect VB\telectoral JJ\telectric JJ\telectronic JJ\telegant JJ 2\telegantly RB 2\telse RB\telsewhere RB\tem PRP\tembarrass VB -2\tembarrassed VBN -2\tembarrassing JJ -2\tembarrassment NN -2\tembittered VBN -2\tembrace VB 1\temerald JJ\temergency NN -2\temotional JJ\tempathetic JJ 2\temptiness NN -1\tempty JJ -1\ten IN\tenable VB\tenchanted VBN 2\tencourage VB 2\tencouraged VBN 2\tencouragement NN 2\tencourages VBZ 2\tendorse VB 2\tendorsed VBN 2\tendorsement NN 2\tendorses VBZ 2\tenemy NN -2\tenergetic JJ 2\tengage VB 1\tengrossed JJ 1\tenhance VB\tenjoy VB 2\tenjoying VBG 2\tenjoys VBZ 2\tenlarge VB\tenlighten VB 2\tenlightened JJ 2\tenlightening VBG 2\tennui NN -2\tenough RB\tenrage NN -2\tenraged JJ -2\tenslave VBP -2\tenslaved VBN -2\tensure VB 1\tensuring VBG 1\tenterprising JJ 1\tentertaining VBG 2\tenthusiastic JJ 3\tentire JJ\tentitled VBN 1\tentrusted VBN 2\tenvious JJ -2\tenvironmental JJ\tenvy NN -1\tequal JJ\ter UH\terroneous JJ -2\terror NN -2\tescape VB -1\tescaping VBG -1\test FW\testablish VB\testeemed VBD 2\tet FW\tetc FW\teternal JJ\tethical JJ 2\tethnic JJ\teuphoria NN 3\teuphoric JJ 4\tevaluate VB\teven RB\tever RB\tevery DT\teveryday JJ\teverywhere RB\tevident JJ\tevil JJ -3\tex FW\texact JJ\texaggerate VB -2\texaggerated VBN -2\texaggerating VBG -2\texasperated JJ 2\texceed VB\texcel VBP\texcellence NN 3\texcellent JJ 3\texceptional JJ\texcess JJ\texcite VB 3\texcited VBN 3\texcitement NN 3\texciting JJ 3\texclude VB -1\texcluded VBN -2\texclusion NN -1\texclusive JJ 2\texcuse NN -1\texecute VB\texempt JJ -1\texhausted VBN -2\texhilarated VBN 3\texhilarating JJ 3\texonerate VB 2\texonerated VBN 2\texonerating VBG 2\texpand VB 1\texpands VBZ 1\texpect VBP\texpel VB -2\texpelled VBN -2\texpelling VBG -2\texperimental JJ\texplicit JJ\texploit VB -2\texploited VBN -2\texploiting VBG -2\texploration NN 1\texplore VB\texpose VB -1\texposed VBN -1\texposes VBZ -1\texposing VBG -1\texpress VB\texpressionless JJ 0\textend VB 1\textends VBZ 1\texterior JJ\texternal JJ\textra JJ\textract VB\textreme JJ\texuberant JJ 4\texultantly RB 3\tfabulous JJ 4\tfacilitate VB\tfad NN -2\tfail VB -2\tfailed VBD -2\tfailing VBG -2\tfails VBZ -2\tfailure NN -2\tfair JJ 2\tfairy JJ\tfaith NN 1\tfaithful JJ 3\tfake JJ -3\tfaking VBG -3\tfallen VBN -2\tfalling VBG -1\tfalse JJ\tfalsified VBN -3\tfalsify VB -3\tfame NN 1\tfamiliar JJ\tfan NN 3\tfancy JJ\tfantastic JJ 4\tfar RB\tfarce NN -1\tfascinate VB 3\tfascinated VBN 3\tfascinates VBZ 3\tfascinating JJ 3\tfascist JJ -2\tfast RB\tfaster RBR\tfastest JJS\tfat JJ\tfatal JJ\tfatality NN -3\tfatigue NN -2\tfatigued VBN -2\tfavor NN 2\tfavored VBN 2\tfavorite JJ 2\tfavors VBZ 2\tfear NN -2\tfearful JJ -2\tfearing VBG -2\tfearless JJ 2\tfearsome JJ -2\tfederal JJ\tfeeble JJ -2\tfelony NN -3\tfemale JJ\tfervent JJ 2\tfervid NN 2\tfestive JJ 2\tfew JJ\tfewer JJR\tfiasco NN -3\tfifth JJ\tfight NN -1\tfinal JJ\tfine JJ 2\tfinest JJS\tfinish VB\tfinite JJ\tfire NN -2\tfired VBN -2\tfiring VBG -2\tfiscal JJ\tfit VB 1\tfitness NN 1\tfitting JJ\tflagship NN 2\tflat JJ\tflees VBZ -1\tflip JJ\tflop NN -2\tflops VBZ -2\tfloral JJ\tflu NN -2\tflush JJ\tflushed VBN -2\tflustered VBN -2\tfocal JJ\tfocused VBN 2\tfond JJ 2\tfondness NN 2\tfool NN -2\tfoolish JJ -2\tfor IN\tforced VBN -1\tforeclosure NN -2\tforeign JJ\tforever RB\tforge VB\tforget VB -1\tforgetful JJ -2\tforgive VB 1\tforgiving VBG 1\tforgotten VBN -1\tformal JJ\tformer JJ\tforth RB\tfortunate JJ 2\tforward RB\tfossil JJ\tfoster VB\tfoul JJ\tfrank JJ\tfrantic JJ -1\tfraud NN -4\tfraudulent JJ -4\tfree JJ 1\tfreedom NN 2\tfreelance JJ\tfrenzy NN -3\tfrequent JJ\tfresh JJ 1\tfriendly JJ 2\tfright NN -2\tfrightened VBN -2\tfrightening JJ -3\tfrisky JJ 2\tfrom IN\tfrowning VBG -1\tfrustrate VB -2\tfrustrated VBN -2\tfrustrates VBZ -2\tfrustrating JJ -2\tfrustration NN -2\tfuck VB -2\tfulfill VB 2\tfulfilled VBN 2\tfulfills VBZ 2\tfull JJ\tfuming VBG -2\tfun NN 4\tfunctional JJ\tfundamental JJ\tfuneral NN -1\tfunky JJ 2\tfunnier JJR 4\tfunny JJ 4\tfurious JJ -3\tfurther JJ\tfurthermore RB\tfutile JJ 2\tfy VBP\tgag NN -2\tgagged VBN -2\tgain NN 2\tgained VBD 2\tgaining VBG 2\tgallant JJ 3\tgallantry NN 3\tgay JJ\tgeneral JJ\tgeneric JJ\tgenerous JJ 2\tgenial JJ 3\tgentle JJ\tgenuine JJ\tgeographic JJ\tghost NN -1\tgiddy JJ -2\tgift NN 2\tglad JJ 3\tglamorous JJ 3\tglee NN 3\tgleeful JJ 3\tglobal JJ\tgloom NN -1\tgloomy JJ -2\tglorious JJ 2\tglory NN 2\tglum JJ -2\tgod NN 1\tgoddamn UH -3\tgodsend NN 4\tgolden JJ\tgone VBN\tgood JJ 3\tgoodness NN 3\tgore VB\tgothic JJ\tgotta VB\tgotten VBN\tgovernmental JJ\tgrace NN 1\tgracious JJ 3\tgrand JJ 3\tgrant NN 1\tgranted VBN 1\tgranting VBG 1\tgraphic JJ\tgrateful JJ 3\tgratification NN 2\tgratis JJ\tgrave JJ -2\tgray JJ -1\tgreat JJ 3\tgreater JJR 3\tgreatest JJS 3\tgreed NN -3\tgreedy JJ -2\tgreen JJ\tgreet VB 1\tgreeted VBD 1\tgreeting NN 1\tgreets VBZ 1\tgrey JJ -1\tgrief NN -2\tgrieved VBN -2\tgrin NN -1\tgrinning VBG 3\tgross JJ -2\tgrowing VBG 1\tgrowth NN 2\tguarantee NN 1\tguess VBP\tguilt NN -3\tguilty JJ -3\tgullibility NN -2\tgullible JJ -2\tgun NN -1\tha UH 2\thacked VBD -1\thail NN 2\thailed VBD 2\thairy JJ\thandheld JJ\thandmade JJ\thandy JJ\thapless JJ -2\thappiness NN 3\thappy JJ 3\thard JJ -1\thardcore JJ\tharder JJR\thardier JJR 2\thardship NN -2\thardy JJ 2\tharm NN -2\tharmed VBN -2\tharmful JJ -2\tharming VBG -2\tharms VBZ -2\tharried VBN -2\tharry VB\tharsh JJ -2\tharsher JJR -2\tharshest JJS -2\thate VBP -3\thated VBD -3\thates VBZ -3\thating VBG -3\thaunt VB -1\thaunted VBN -2\thaunting JJ 1\thavoc NN -2\the PRP\thealthy JJ 2\theartbreaking JJ -3\theartfelt JJ 3\theaven NN 2\theavenly JJ 4\theavy JJ\thell NN -4\thello UH\thelp VB 0\thelpful JJ 2\thelping VBG 2\thelpless JJ -2\thelps VBZ 2\thence RB\ther PRP$\therald VB\therbal JJ\there RB\thereby RB\therein RB\thero NN 2\theroic JJ 3\therself PRP\thesitant JJ -2\thesitate VB -2\they UH\thid VBD -1\thide VB -1\thiding VBG -1\thigh JJ\thigher JJR\thighest JJS\thighlight VB 2\thilarious JJ 2\thim PRP\thimself PRP\thindrance NN -2\thire VB\this PRP$\thistoric JJ\tho UH\thollow JJ\tholy JJ\thomesick JJ -2\thonest JJ 2\thonor NN 2\thonored VBN 2\thonoring VBG 2\thonour NN 2\thonoured VBN 2\thooliganism NN -2\thope NN 2\thopeful JJ 2\thopefully RB 2\thopeless JJ -2\thopelessness NN -2\thopes VBZ 2\thoping VBG 2\thorizontal JJ\thorrendous JJ -3\thorrible JJ -3\thorrific JJ -3\thorrified VBN -3\thostile JJ -2\thot JJ\thottest JJS\thourly JJ\thow WRB\thowever RB\thuckster NN -2\thug NN 2\thuge JJ 1\thugh JJ\thuman JJ\thumanitarian JJ\thumiliated VBN -3\thumiliation NN -3\thumor NN 2\thumorous JJ 2\thumour NN 2\thunger NN -2\thungry JJ\thurrah NN 5\thurt VBN -2\thurting VBG -2\thurts VBZ -2\thushed JJ -1\thydraulic JJ\thypocritical JJ -2\thysteria NN -3\thysterical JJ -3\tideal JJ\tidiot JJ -3\tidiotic JJ -3\tidle JJ\tif IN\tignorance NN -2\tignorant JJ -2\tignore VB -1\tignored VBN -2\tignores VBZ -1\till JJ -2\tillegal JJ -3\tilliteracy NN -2\tillness NN -2\timbecile NN -3\timmediate JJ\timmobilized VBN -1\timmortal JJ 2\timmune JJ 1\timpatient JJ -2\timperfect JJ -2\timplement VB\timportance NN 2\timportant JJ 2\timpose VB -1\timposed VBN -1\timposes VBZ -1\timposing VBG -1\timpotent JJ -2\timpress VB 3\timpressed VBN 3\timpresses VBZ 3\timpressive JJ 3\timprisoned VBN -2\timprove VB 2\timproved VBN 2\timprovement NN 2\timproves VBZ 2\timproving VBG 2\tin IN\tinability NN -2\tinaction NN -2\tinadequate JJ -2\tinappropriate JJ\tincapable JJ -2\tincapacitated VBN -2\tincensed VBN -2\tinclude VBP\tincoming JJ\tincompetence NN -2\tincompetent JJ -2\tincomplete JJ\tinconvenience NN -2\tinconvenient JJ -2\tincorrect JJ\tincrease NN 1\tincreased VBN 1\tindecisive JJ -2\tindependent JJ\tindestructible JJ 2\tindicate VB\tindifference NN -2\tindifferent JJ -2\tindignant JJ -2\tindignation NN -2\tindirect JJ\tindividual JJ\tindoctrinated VBN -2\tindoctrinating NN -2\tindoor JJ\tineffective JJ -2\tineffectively RB -2\tinfatuation NN 2\tinfected VBN -2\tinferior JJ -2\tinfinite JJ\tinflamed JJ -2\tinfluential JJ 2\tinformal JJ\tinformational JJ\tinfrared JJ\tinfringement NN -2\tinfuriate VB -2\tinfuriated VBD -2\tinfuriating JJ -2\tinhibit VB -1\tinjured VBN -2\tinjury NN -2\tinjustice NN -2\tinner JJ\tinnocent JJ 4\tinnovate VB 1\tinnovation NN 1\tinnovative JJ 2\tinquire VB\tinquisitive JJ 2\tinsane JJ -2\tinsanity NN -2\tinsecure JJ -2\tinsensitive JJ -2\tinsensitivity NN -2\tinsert VB\tinside IN\tinsignificant JJ -2\tinsipid JJ -2\tinspiration NN 2\tinspirational JJ 2\tinspire VB 2\tinspired VBN 2\tinspires VBZ 2\tinspiring JJ 3\tinstall VB\tinstead RB\tinstitutional JJ\tinstructional JJ\tinstrumental JJ\tinsult NN -2\tinsulted VBN -2\tinsulting JJ -2\tintact JJ 2\tintegrity NN 2\tintellectual JJ\tintelligent JJ 2\tintend VBP\tintense JJ 1\tinter FW\tinteract VBP\tinterest NN 1\tinterested JJ 2\tinteresting JJ 2\tinterim JJ\tinterior JJ\tintermediate JJ\tinternal JJ\tinternational JJ\tinterrogated VBN -2\tinterrupt VB -2\tinterrupted VBN -2\tinterrupting VBG -2\tinterruption NN -2\tinterrupts VBZ -2\tinterstate JJ\tintimate JJ\tintimidate VB -2\tintimidated VBN -2\tintimidates VBZ -2\tintimidating VBG -2\tintimidation NN -2\tinto IN\tintricate JJ 2\tintroductory JJ\tinvalid JJ\tinvest VB\tinvestigate VB\tinvincible JJ 2\tinvite VB 1\tinviting VBG 1\tinvolve VB\tinvulnerable JJ 2\tirate JJ -3\tironic JJ -1\tirony NN -1\tirrational JJ -1\tirresistible JJ 2\tirresolute JJ -2\tirresponsible JJ 2\tirreversible JJ -1\tirritate VB -3\tirritated VBN -3\tirritating JJ -3\tisolated VBN -1\tist FW\tit PRP\titchy JJ -2\tits PRP$\titself PRP\tjack VB\tjackass NN -4\tjailed VBN -2\tjaunty JJ 2\tje FW\tjealous JJ -2\tjeopardy NN -2\tjerk NN -3\tjewel NN 1\tjocular JJ 2\tjoin VB 1\tjoint JJ\tjoke NN 2\tjolly JJ 2\tjovial JJ 2\tjoy NN 3\tjoyful JJ 3\tjoyfully RB 3\tjoyless JJ -2\tjoyous JJ 3\tjubilant JJ 3\tjumpy JJ -1\tjunior JJ\tjustice NN 2\tjustifiably RB 2\tjustified VBN 2\tjuvenile JJ\tkaraoke FW\tkeen JJ 1\tkeno JJ\tkey JJ\tkill VB -3\tkilled VBN -3\tkilling VBG -3\tkills VBZ -3\tkind NN JJ/2\tkinda RB\tkinder JJR 2\tkiss NN 2\tkissing VBG 3\tla FW\tlack NN -2\tlackadaisical JJ -2\tladen JJ\tlag VB -1\tlagged VBN -2\tlagging VBG -2\tlags VBZ -2\tlame JJ -2\tlandmark NN 2\tlarge JJ\tlarger JJR\tlargest JJS\tlate JJ\tlater RB\tlaugh NN 1\tlaughed VBD 1\tlaughing VBG 1\tlaughs VBZ 1\tlaunched VBN 1\tlawsuit NN -2\tlazy JJ -1\tle FW\tleak NN -1\tleaked VBN -1\tlean JJ\tleast JJS\tleave VB -1\tlegal JJ 1\tlegally RB 1\tlegendary JJ\tlegitimate JJ\tlenient JJ 1\tles FW\tless JJR\tlesser JJR\tlethargic JJ -2\tlethargy NN -2\tliar NN -3\tlibelous JJ -2\tliberal JJ\tlied VBD -2\tlift VB\tlighter JJR\tlighthearted JJ 1\tlightweight JJ\tlike VBP 2\tliked VBD 2\tlikely JJ\tlikes VBZ 2\tlimitation NN -1\tlimited JJ -1\tlinear JJ\tliquid JJ\tliterary JJ\tlitigation NN -1\tlitigious JJ -2\tlittle JJ\tlively JJ 2\tlivid JJ -2\tlo UH\tloathed VBD -3\tloathes VBZ -3\tloathing NN -3\tlobbying VBG -2\tlocal JJ\tlocate VB\tlocking JJ\tlone JJ\tlonely JJ -2\tlonesome JJ -2\tlong JJ\tlonger RB\tlongest JJS\tlonging NN -1\tloom VBP -1\tloomed VBD -1\tlooming VBG -1\tlooms VBZ -1\tloose JJ -3\tloser NN -3\tlosing VBG -3\tloss NN -3\tlost VBD -3\tloud JJ\tlovable JJ 3\tlove NN 3\tloved VBD 3\tlovely JJ 3\tloving JJ 2\tlow JJ -1\tlower JJR\tlowest JJS -1\tloyal JJ 3\tloyalty NN 3\tluck NN 3\tluckily RB 3\tlucky JJ 3\tlunatic JJ -3\tlurk VB -1\tlurking VBG -1\tlurks VBZ -1\tlyric JJ\tma FW\tmad JJ -3\tmaddening JJ -3\tmadly RB -3\tmadness NN -3\tmagnificent JJ\tmai MD\tmain JJ\tmaintain VB\tmajor JJ\tmale JJ\tmandatory JJ -1\tmanipulated VBN -1\tmanipulating VBG -1\tmanipulation NN -1\tmanual JJ\tmanufacture VB\tmany JJ\tmar VB\tmaritime JJ\tmarvel VB 3\tmarvelous JJ 3\tmask NN -1\tmasterpiece NN 4\tmatter NN 1\tmature JJ 2\tmaximum JJ\tmaybe RB\tme PRP\tmeaningful JJ 2\tmeaningless JJ -2\tmeanwhile RB\tmedal NN 3\tmedian JJ\tmedieval JJ\tmediocrity NN -3\tmeditative JJ 1\tmega JJ\tmelancholy NN -2\tmem FW\tmenace NN -2\tmenaced VBN -2\tmental JJ\tmention VB\tmercy NN 2\tmere JJ\tmerge VB\tmerry JJ 3\tmess NN -2\tmessed VBD -2\tmessing VBG -2\tmetallic JJ\tmethodical JJ 2\tmetric JJ\tmetropolitan JJ\tmh UH\tmicro JJ\tmid JJ\tmidwest JJS\tmight MD\tmighty JJ\tmild JJ\tmindless JJ -2\tminiature JJ\tminimal JJ\tminimum JJ\tminor JJ\tminus CC\tmiracle NN 4\tmirth NN 3\tmisbehaving VBG -2\tmischief NN -1\tmiserable JJ -3\tmisery NN -2\tmisinformation NN -2\tmisinformed VBN -2\tmisinterpreted VBN -2\tmisleading JJ -3\tmisread VBD -1\tmisrepresentation NN -2\tmiss VB -2\tmissed VBD -2\tmissing VBG -2\tmistake NN -2\tmistaken VBN -2\tmistaking VBG -2\tmisunderstand VB -2\tmisunderstanding NN -2\tmisunderstands VBZ -2\tmisunderstood VBN -2\tmoan VB -2\tmoaned VBD -2\tmoaning VBG -2\tmoans VBZ -2\tmobile JJ\tmock JJ -2\tmocked VBN -2\tmocking VBG -2\tmoderate JJ\tmodern JJ\tmon FW\tmonitor VB\tmono JJ\tmonopolize VB -2\tmonopolized VBD -2\tmonopolizing VBG -2\tmonthly JJ\tmoody JJ -1\tmoral JJ\tmore JJR\tmoreover RB\tmost RBS\tmotivate VB 1\tmotivated VBN 2\tmotivating VBG 2\tmotivation NN 1\tmount VB\tmourn VB -2\tmourned VBD -2\tmournful JJ -2\tmourning VBG -2\tmourns VBZ -2\tmuch JJ\tmultiple JJ\tmunicipal JJ\tmurder NN -2\tmurderer NN -2\tmurdering VBG -3\tmurderous JJ -3\tmust MD\tmutual JJ\tmy PRP$\tmyself PRP\tmyth NN -1\tna TO\tnaive JJ -2\tnaked JJ\tnarrow JJ\tnasty JJ -3\tnational JJ\tnationwide JJ\tnatural JJ 1\tnaughty JJ\tnaval JJ\tnavigate VB\tnd CC\tne FW\tnear IN\tnearby JJ\tnearest JJS\tnecessary JJ\tneedy JJ -2\tnegative JJ -2\tneglect NN -2\tneglected VBN -2\tneglecting VBG -2\tneglects VBZ -2\tneo JJ\tnervous JJ -2\tnervously RB -2\tnet JJ\tneural JJ\tneutral JJ\tnevertheless RB\tnew JJ\tnewer JJR\tnewest JJS\tnice JJ 3\tnifty JJ 2\tnigger NN -5\tnil JJ\tnoble JJ 2\tnoisy JJ -1\tnon FW\tnonprofit JJ\tnonsense NN -2\tnormal JJ\tnorth RB\tnorthern JJ\tnorthwest RB\tnotorious JJ -2\tnovel NN 2\tnow RB\tnowhere RB\tnuclear JJ\tnude JJ\tnudist JJ\tnull JJ\tnumb JJ -1\tnutritional JJ\to IN\tobliterate VB -2\tobliterated VBN -2\tobnoxious JJ -3\tobscene JJ -2\tobsessed VBN 2\tobsolete JJ -2\tobstacle NN -2\tobstinate JJ -2\toccasional JJ\toccupational JJ\todd JJ -2\tof IN\toff IN\toffend VB -2\toffended VBN -2\toffender NN -2\toffending VBG -2\toffends VBZ -2\toffset VB\toffshore JJ\toften RB\toh UH\tohhdee UH 1\toks VBZ 2\tol JJ\told JJ\tolder JJR\tominous JJ 3\ton IN\tonce RB\tongoing JJ\tonline JJ\tonto IN\toops UH\topen JJ\toperational JJ\topportunity NN 2\topposite JJ\toppressed JJ -2\toppressive JJ -2\topt VB\toptimal JJ\toptimism NN 2\toptimistic JJ 2\toptimum JJ\toptional JJ\tor CC\toral JJ\torange JJ\torganic JJ\torganizational JJ\toriental JJ\toriginal JJ\tother JJ\tought MD\tour PRP$\tours PRP\tourselves PRP\tout IN\toutcry NN -2\toutdoor JJ\toutdoors RB\touter JJ\toutmaneuvered VBN -2\toutrage NN -3\toutraged VBN -3\toutreach NN 2\toutside IN\toutstanding JJ 5\toval JJ\tover IN\toverall JJ\tovercome VB\toverhead JJ\toverjoyed JJ 4\toverload NN -1\toverlooked VBN -1\tovernight JJ\toverreact VB -2\toverreacted VBN -2\toverreaction NN -2\toverseas JJ\toversimplification NN -2\toversimplified VBN -2\toverstatement NN -2\toverweight JJ -1\town JJ\tpacific JJ\tpain NN -2\tpained JJ -2\tpale JJ\tpanic NN -3\tpanicked VBD -3\tparadise NN 3\tparadox NN -1\tparallel JJ\tpardon VB 2\tpardoned VBN 2\tparental JJ\tparley NN -1\tparticipate VB\tpas FW\tpassionate JJ 2\tpassive JJ -1\tpassively RB -1\tpast JJ\tpat JJ\tpathetic JJ -2\tpay VB -1\tpeace NN 2\tpeaceful JJ 2\tpeacefully RB 2\tpediatric JJ\tpenalty NN -2\tper IN\tperfect JJ 3\tperfected VBN 2\tperfectly RB 3\tperhaps RB\tperil NN -2\tperiodic JJ\tperipheral JJ\tperjury NN -3\tpermanent JJ\tperpetrator NN -2\tperplexed JJ -2\tpersecute VBP -2\tpersecuted VBN -2\tpersecuting VBG -2\tpersevere VB -2\tpersistent JJ\tpersonal JJ\tperturbed JJ -2\tpessimism NN -2\tpessimistic JJ -2\tpeter VB\tpetite JJ\tpetrified JJ -2\tphantom JJ\tphotographic JJ\tpicturesque JJ 2\tpierce VB\tpileup NN -1\tpink JJ\tpique JJ -2\tpiqued VBN -2\tpiss VB -4\tpiteous JJ -2\tpitied VBD -1\tpity NN -2\tplain JJ\tplayful JJ 2\tpleasant JJ 3\tplease VB 1\tpleased VBN 3\tpleasure NN 3\tplus CC\tpoised VBN -2\tpoison NN -2\tpoisoned VBN -2\tpolar JJ\tpollute VB -2\tpolluted JJ -2\tpolluter NN -2\tpoor JJ -2\tpoorer JJR -2\tpoorest JJS -2\tpopular JJ 3\tpose VB\tpositive JJ 2\tpositively RB 2\tpossess VBP\tpossessive JJ -2\tpostal JJ\tpostpone VB -1\tpostponed VBN -1\tpostponing VBG -1\tpoverty NN -1\tpowerful JJ 2\tpowerless JJ -2\tpraise NN 3\tpraised VBD 3\tpraises VBZ 3\tpraising VBG 3\tpray VB 1\tpraying VBG 1\tprays VBZ 1\tprecise JJ\tpredict VBP\tprefer VBP\tpreferred JJ\tpregnant JJ\tprep JJ\tprepaid JJ\tprepared VBN 1\tpresent JJ\tpressure NN -1\tpressured VBN -2\tpretend VB -1\tpretending VBG -1\tpretends VBZ -1\tpretty RB 1\tprevent VB -1\tprevented VBN -1\tpreventing VBG -1\tprevents VBZ -1\tprick NN -5\tprimary JJ\tprime JJ\tprincipal JJ\tprior RB\tprison NN -2\tprisoner NN -2\tprivate JJ\tprivileged JJ 2\tpro FW\tproblem NN -2\tproceed VB\tprofessional JJ\tprogress NN 2\tprominent JJ 2\tpromise NN 1\tpromised VBD 1\tpromises VBZ 1\tpromising JJ\tpromote VB 1\tpromoted VBN 1\tpromotes VBZ 1\tpromoting VBG 1\tpromotional JJ\tprompt VB\tpropaganda NN -2\tproper JJ\tpropose VB\tprosecute VB -1\tprosecuted VBN -2\tprosecution NN -1\tprospect NN 1\tprosperous JJ 3\tprotect VB 1\tprotected VBN 1\tprotects VBZ 1\tprotest NN -2\tprotesting VBG -2\tproud JJ 2\tproudly RB 2\tproven VBN\tprovoke VB -1\tprovoked VBD -1\tprovokes VBZ -1\tprovoking VBG -1\tpublic JJ\tpublish VB\tpunish VB -2\tpunished VBN -2\tpunishes VBZ -2\tpunitive JJ -2\tpure JJ\tpurple JJ\tpursuant JJ\tpursue VB\tpushy JJ -1\tpuzzled VBN -2\tquaking VBG -2\tquarterly JJ\tque FW\tquestionable JJ -2\tquestioned VBD -1\tquestioning VBG -1\tqui FW\tquick JJ\tquiet JJ\tquite RB\tquote VB\tracism NN -3\tracist JJ -3\trage NN -2\trainy JJ -1\tram VB\trandom JJ\tranking JJ\trant VBP -3\trape NN -4\trapid JJ\trapist NN -4\trapture NN 2\trare JJ\trash NN -2\trather RB\tratified VBD 2\trational JJ\traw JJ\treach VB 1\treached VBN 1\treaches VBZ 1\treaching VBG 1\tready JJ\treal JJ\trear JJ\treassure VB 1\treassured VBN 1\treassuring VBG 2\trebellion NN -2\trecall VB\trecent JJ\trecession NN -2\trecipient JJ\treckless JJ -2\trecommend VB 2\trecommended VBD 2\trecommends VBZ 2\trecover VB\trecreational JJ\tred JJ\tredeem VB\tredeemed VBN 2\trefer VB\trefinance VB\trefine VB\trefined JJ\trefresh VBP\trefuse VB -2\trefused VBD -2\trefusing VBG -2\tregardless RB\tregional JJ\tregister VB\tregret VBP -2\tregrets VBZ -2\tregretted VBD -2\tregulatory JJ\treject VB -1\trejected VBD -1\trejecting VBG -1\trejects VBZ -1\trejoice VBP 4\trejoiced VBD 4\trejoices VBZ 4\trejoicing VBG 4\trelate VBP\trelaxed VBN 2\trelay VB\trelentless JJ -1\trelevant JJ\treliant JJ 2\trelieve VB 1\trelieved VBN 2\trelieves VBZ 1\trelieving VBG 2\trelishing VBG 2\tremarkable JJ 2\tremorse NN -2\tremote JJ\trender VB\trenew VB\trental JJ\trepresent VB\treprint VB\trepublican JJ\trepulsed VBN -2\trequire VB\trescue NN 2\trescued VBN 2\treseller JJR\tresentful JJ -2\tresign VB -1\tresigned VBD -1\tresigning VBG -1\tresigns VBZ -1\tresist VB\tresistant JJ\tresolute JJ 2\tresolve VB 2\tresolved VBN 2\tresolves VBZ 2\tresolving VBG 2\trespected VBN 2\trespiratory JJ\trespond VB\tresponsible JJ 2\tresponsive JJ 2\trestful JJ 2\trestless JJ -2\trestore VB 1\trestored VBN 1\trestores VBZ 1\trestoring VBG 1\trestrict VB -2\trestricted VBN -2\trestricting VBG -2\trestriction NN -2\trestricts VBZ -2\tresume VB\tretail JJ\tretain VB\tretained VBN -1\tretard VB -2\tretarded JJ -2\tretreat NN -1\tretrieve VB\tretro JJ\treveal VB\trevenge NN -2\trevered VBN 2\treverse VB\trevive VB 2\trevives VBZ 2\treward NN 2\trewarded VBN 2\trewarding JJ 2\trich JJ 2\trid JJ\tridiculous JJ -3\trig NN -1\trigged VBN -1\trigorous JJ 3\trigorously RB 3\triot NN -2\trip VB\tripe JJ\trisk NN -2\trob VB -2\trobber NN -2\trobed VBN -2\trobing NN -2\trobs VBZ -2\trobust JJ 2\trocky JJ\tromance NN 2\trouge FW\trough JJ\troutine JJ\troyal JJ\truin NN -2\truined VBN -2\truining VBG -2\trural JJ\tsabotage NN -2\tsacred JJ\tsad JJ -2\tsaddened JJ -2\tsadly RB -2\tsafe JJ 1\tsafely RB 1\tsafer JJR\tsafety NN 1\tsalient JJ 1\tsally VB\tsame JJ\tsandy JJ\tsap VB\tsappy JJ -1\tsarcastic JJ -2\tsatisfactory JJ\tsatisfied VBN 2\tsavage JJ\tsave VB 2\tsaved VBN 2\tscam NN -2\tscandal NN -3\tscandalous JJ -3\tscapegoat NN -2\tscare VB -2\tscared VBN -2\tscary JJ -2\tscenic JJ\tsceptical JJ -2\tscientific JJ\tscold VB -2\tscoop NN 3\tscorn NN -2\tscornful JJ -2\tscream VB -2\tscreamed VBD -2\tscreaming VBG -2\tscrew NN -2\tscrewed VBN -2\tse FW\tseasonal JJ\tsecondary JJ\tsecret JJ\tsecretary NN-\tsecure VB 2\tsecured VBN 2\tsedition NN -2\tseditious JJ -2\tseduced VBN -1\tseem VB\tselect VB\tselfish JJ -3\tselfishness NN -3\tsenior JJ\tsentence NN -2\tsentenced VBN -2\tsentencing NN -2\tseparate JJ\tserene JJ 2\tseventh JJ\tseveral JJ\tsevere JJ -2\tsexual JJ\tsexy JJ 3\tshaky JJ -2\tshall MD\tshame NN -2\tshamed VBN -2\tshameful JJ -2\tshare NN 1\tshared VBN 1\tsharp JJ\tshattered VBN -2\tshe PRP\tsheer JJ\tshit NN -4\tshock NN -2\tshocked VBN -2\tshocking JJ -2\tshoot VB -1\tshort JJ\tshortage NN -2\tshorter JJR\tshould MD\tshy JJ -1\tsic RB\tsick JJ -2\tsigh NN -2\tsignificance NN 1\tsignificant JJ 1\tsilencing VBG -1\tsilent JJ\tsilly JJ -1\tsimple JJ\tsimplified JJ\tsince IN\tsincere JJ 2\tsincerely RB 2\tsincerest JJS 2\tsincerity NN 2\tsinful JJ -3\tsingle JJ\tsixth JJ\tskeptic NN -2\tskeptical JJ -2\tskepticism NN -2\tskilled JJ\tsl UH\tslam NN -2\tslash VB -2\tslashed VBD -2\tslashing VBG -2\tslavery NN -3\tsleeping VBG 0\tsleeplessness NN -2\tsleepy JJ 0\tslick JJ 2\tslicker NN 2\tslight JJ\tslim JJ\tslow JJ\tsluggish JJ -2\tsmall JJ\tsmaller JJR\tsmallest JJS\tsmart JJ 1\tsmarter RBR 2\tsmartest JJS 2\tsmear NN -2\tsmile NN 2\tsmiled VBD 2\tsmiling VBG 2\tsmirk NN 3\tsmog NN -2\tsmooth JJ\tsnap VB\tsneaky JJ -1\tsnub VB -2\tso RB\tsob VB -4\tsobering VBG 1\tsoft JJ\tsolar JJ\tsole JJ\tsolemn JJ -1\tsolid JJ 2\tsolidarity NN 2\tsolution NN 1\tsolve VB 1\tsolved VBN 1\tsolves VBZ 1\tsolving VBG 1\tsomber JJ -2\tsome DT\tsomehow RB\tsomething NN-\tsometimes RB\tsomewhat RB\tsomewhere RB\tsonic JJ\tsoon RB\tsoonest JJS\tsoothe VB 3\tsoothed VBD 3\tsoothing VBG 3\tsophisticated JJ 2\tsore JJ -1\tsorrow NN -2\tsorrowful JJ -2\tsorry JJ- -1\tsouth RB\tsoutheast RB\tsouthern JJ\tsouthwest RB\tsoviet JJ\tspanking JJ\tspare JJ\tspark VB 1\tsparkle NN 3\tsparkles VBZ 3\tsparkling JJ 3\tspecialized JJ\tspecific JJ\tspeculative JJ -2\tspirit NN 1\tspirited JJ 2\tspiritless JJ -2\tspiritual JJ\tsplendid JJ 3\tsprightly JJ 2\tsq JJ\tsquelched VBN -1\tstab NN -2\tstabbed VBD -2\tstable JJ 2\tstall NN -2\tstalled VBN -2\tstalling VBG -2\tstamina NN 2\tstampede NN -2\tstandard JJ\tstartled VBN -2\tstarve VB -2\tstarved VBN -2\tstarving VBG -2\tstatewide JJ\tstatutory JJ\tsteadfast JJ 2\tsteady JJ\tsteal VB -2\tsteals VBZ -2\tsteep JJ -2\tstem VB\tstereotype NN -2\tstereotyped JJ -2\tsticky JJ\tstifled VBD -1\tstill RB\tstimulate VB 1\tstimulated VBN 1\tstimulates VBZ 1\tstimulating VBG 2\tstingy JJ -2\tstolen VBN -2\tstop VB -1\tstopped VBD -1\tstopping VBG -1\tstops VBZ -1\tstout JJ 2\tstraight JJ 1\tstrange JJ -1\tstrangely RB -1\tstrangled VBN -2\tstrength NN 2\tstrengthen VB 2\tstrengthened VBN 2\tstrengthening VBG 2\tstrengthens VBZ 2\tstressed VBD -2\tstricken VBN -2\tstrict JJ\tstrike NN -1\tstriking JJ\tstrong JJ 2\tstronger JJR 2\tstrongest JJS 2\tstruck VBD -1\tstructural JJ\tstruggle NN -2\tstruggled VBD -2\tstruggling VBG -2\tstubborn JJ -2\tstuck VBN -2\tstunned VBD -2\tstunning JJ 4\tstupid JJ -2\tstupidly RB -2\tsuave JJ 2\tsublime JJ\tsubmit VB\tsubscribe VB\tsubsequent JJ\tsubstantial JJ 1\tsubstantially RB 1\tsubtle JJ\tsuburban JJ\tsubversive JJ -2\tsuccess NN 2\tsuccessful JJ 3\tsuch JJ\tsuck VB -3\tsucks VBZ -3\tsudden JJ\tsue VB\tsuffer VB -2\tsuffering VBG -2\tsuffers VBZ -2\tsufficient JJ\tsuggest VBP\tsuicidal JJ -2\tsuicide NN -2\tsuing VBG -2\tsulking VBG -2\tsulky JJ -2\tsullen JJ -2\tsunglasses NN 1\tsunny JJ\tsunshine NN 2\tsuper JJ 3\tsuperb JJ 5\tsuperior JJ 2\tsupplemental JJ\tsupport NN 2\tsupported VBN 2\tsupporter NN 1\tsupporting VBG 1\tsupportive JJ 2\tsupports VBZ 2\tsuppose VBP\tsur FW\tsurprising JJ\tsurround VBP\tsurvive VB\tsurvived VBD 2\tsurviving VBG 2\tsurvivor NN 2\tsuspect VBP -1\tsuspected VBN -1\tsuspecting VBG -1\tsuspects VBZ -1\tsuspend VB -1\tsuspended VBN -1\tsuspicious JJ -2\tswear VB -2\tswearing NN -2\tswears VBZ -2\tsweat NN -1\tsweet JJ 2\tswift JJ 2\tswiftly RB 2\tswindling VBG -3\tsympathetic JJ 2\tsympathy NN 2\ttackle VB\ttalented JJ\ttall JJ\ttan JJ\tteen JJ\tteenage JJ\ttemporal JJ\ttemporary JJ\ttend VBP\ttender NN 2\ttense JJ -2\ttension NN -1\tterrible JJ -3\tterribly RB -3\tterrific JJ 4\tterrified VBN -3\tterror NN -3\tterrorist JJ\tterrorize VB -3\tterrorized VBN -3\tth DT\tthan IN\tthank VB 2\tthankful JJ 2\tthat IN\tthe DT\tthee PRP\ttheir PRP$\tthem PRP\tthemselves PRP\tthen RB\tthere EX\tthereafter RB\tthereby RB\ttherefore RB\tthereof RB\tthermal JJ\tthese DT\tthey PRP\tthick JJ\tthin JJ\tthis DT\tthorny JJ -2\tthorough JJ\tthose DT\tthou PRP\tthough IN\tthoughtful JJ 2\tthoughtless JJ -2\tthreat NN -2\tthreaten VB -2\tthreatened VBN -2\tthreatening VBG -2\tthreatens VBZ -2\tthrilled VBN 5\tthrough IN\tthroughout IN\tthus RB\tthwart VB -2\tthwarted VBN -2\tthwarting VBG -2\tthy JJ\ttight JJ\ttill IN\ttimely JJ\ttimid JJ -2\ttimorous JJ -2\ttiny JJ\ttired VBN -2\tto TO\ttogether RB\ttoken JJ\ttolerant JJ 2\ttonight RB\ttony JJ\ttoo RB\ttoothless JJ -2\ttop JJ 2\ttorn VBN -2\ttorture NN -4\ttortured VBN -4\ttotal JJ\ttotalitarian JJ -2\ttotalitarianism NN -2\ttough JJ\ttout VB -2\ttouted VBN -2\ttouting VBG -2\ttouts VBZ -2\ttoward IN\ttowards IN\ttoxic JJ\ttraditional JJ\ttragedy NN -2\ttragic JJ -2\ttranquil JJ 2\ttransform VB\ttransmit VB\ttransparent JJ\ttrap NN -1\ttrapped VBN -2\ttrauma NN -3\ttraumatic JJ -3\ttravesty NN -2\ttreason NN -3\ttreasonous JJ -3\ttreasure NN 2\ttrembling VBG -2\ttremulous JJ -2\ttribal JJ\ttricked VBN -2\ttrickery NN -2\ttrigger VB\ttrim VB\ttriple JJ\ttriumph NN 4\ttriumphant JJ 4\ttrouble NN -2\ttroubled JJ -2\ttrue JJ 2\ttrust NN 1\ttrusted VBN 2\ttumor NN -2\ttwice RB\ttwin JJ\tu PRP\tugh UH -1\tugly JJ -3\tuh UH\tultimate JJ\tultra JJ\tum FW\tun FW\tunacceptable JJ -2\tunamused VBN -2\tunappreciated JJ -2\tunapproved JJ -2\tunauthorized JJ\tunaware JJ -2\tunbelievable JJ -1\tunbelieving JJ -1\tunbiased JJ 2\tuncertain JJ -1\tunclear JJ -1\tuncomfortable JJ -2\tunconcerned JJ -2\tunconfirmed JJ -1\tunconvinced JJ -1\tund FW\tundecided JJ -1\tundefined JJ\tunder IN\tunderestimate VB -1\tunderestimated VBN -1\tunderestimates VBZ -1\tundergraduate JJ\tunderground JJ\tundermine VB -2\tundermined VBN -2\tundermines VBZ -2\tundermining VBG -2\tundesirable JJ -2\tundo VB\tune FW\tuneasy JJ -2\tunemployment NN -2\tunequal JJ -1\tunequaled JJ 2\tunethical JJ -2\tunexpected JJ\tunfair JJ -2\tunfocused JJ -2\tunfulfilled JJ -2\tunhappy JJ -2\tunhealthy JJ -2\tunified JJ 1\tunimpressed JJ -2\tunique JJ\tunited VBN 1\tuniversal JJ\tunjust JJ -2\tunknown JJ\tunless IN\tunlimited JJ\tunlovable JJ -2\tunmatched JJ 1\tunmotivated JJ -2\tunnecessary JJ\tunprofessional JJ -2\tunsatisfied JJ -2\tunsecured JJ -2\tunsettled JJ -1\tunsigned JJ\tunsophisticated JJ -2\tunstable JJ -2\tunstoppable JJ 2\tunsupported JJ -2\tunsure JJ -1\tuntarnished JJ 2\tuntil IN\tunto IN\tunusual JJ\tunwanted JJ -2\tunworthy JJ -2\tup IN\tupcoming JJ\tupdate VB\tupgrade VB\tupon IN\tupper JJ\tupset VBN -2\tupsetting VBG -2\tuptight JJ -2\turban JJ\turge VB\turgent JJ -1\tus PRP\tuseful JJ 2\tusefulness NN 2\tuseless JJ -2\tuselessness NN -2\tusual JJ\tvague JJ -2\tvalid JJ\tvalidate VB 1\tvalidated VBN 1\tvalidating VBG 1\tvary VBP\tvast JJ\tvegetarian JJ\tverbal JJ\tverdict NN -1\tversus IN\tvery RB\tvested VBN 1\tvexing JJ -2\tvia IN\tvibrant JJ 3\tvicious JJ -2\tvictim NN -3\tvictimize VBP -3\tvictimized VBN -3\tvictimizes VBZ -3\tvigilant JJ 3\tvile JJ -3\tvindicate VB 2\tvindicated VBN 2\tvintage JJ\tviolate VB -2\tviolated VBD -2\tviolates VBZ -2\tviolating VBG -2\tviolence NN -3\tviolent JJ -3\tviral JJ\tvirgin JJ\tvirtual JJ\tvirtuous JJ 2\tvirulent JJ -2\tvision NN 1\tvisionary JJ 3\tvisual JJ\tvital JJ\tvitality NN 3\tvitamin NN 1\tvitriolic JJ -3\tvivacious JJ 3\tvocal JJ\tvocational JJ\tvociferous JJ -1\tvulnerability NN -2\tvulnerable JJ -2\tw IN\twalkout NN -2\twan JJ\twanna VB\twant VBP 1\twar NN -2\twarfare NN -2\twarm JJ 1\twarmth NN 2\twarn VB -2\twarned VBD -2\twarning NN -3\twarns VBZ -2\twaste NN -1\twasted VBN -2\twasting VBG -2\twavering VBG -1\twe PRP\tweak JJ -2\tweakness NN -2\twealth NN 3\twealthy JJ 2\tweary JJ -2\tweekly JJ\tweep VB -2\tweeping VBG -2\tweighted JJ\tweird JJ -2\twelcome JJ 2\twelcomed VBD 2\twelcomes VBZ 2\twell RB\twestern JJ\twet JJ\twhat WP\twhatever WDT\twhen WRB\twhenever WRB\twhere WRB\twhereas IN\twherever WRB\twhether IN\twhich WDT\twhile IN\twhimsical JJ 1\twhite JJ\twhitewash NN -3\twho WP\twhole JJ\twholesale JJ\twhom WP\twhore NN -4\twhose WP$\twhy WRB\twicked JJ -2\twide JJ\twider JJR\twidespread JJ\twidowed VBN -1\twild JJ\twill MD\twilling JJ\twillingness NN 2\twin VB 4\twink NN 4\twinner NN 4\twinning VBG 4\twins VBZ 4\twise JJ\twish VBP 1\twishes VBZ 1\twishing VBG 1\twith IN\twithdrawal NN -3\twithin IN\twoebegone JJ -2\twoeful JJ -3\twon VBD 3\twonderful JJ 4\twoo VB 3\twooden JJ\tworldwide JJ\tworn VBN -1\tworried VBN -3\tworry VB -3\tworrying VBG -3\tworse JJR -3\tworsen VB -3\tworsened VBD -3\tworsening VBG -3\tworsens VBZ -3\tworshiped VBN 3\tworst JJS -3\tworth JJ 2\tworthless JJ -2\tworthy JJ 2\twould MD\twrathful JJ -3\twreck NN -2\twrong JJ -2\twronged VBN -2\tye PRP\tyeah UH 1\tyearly JJ\tyearning NN 1\tyellow JJ\tyet RB\tyield VB\tyo UH\tyoung JJ\tyounger JJR\tyour PRP$\tyours PRP\tyourself PRP\tyouthful JJ 2\tyummy JJ 3\tzealot NN -2\tzealous JJ 2\tzu FW\t{ (\t} )\t😠 EM -4\t😧 EM -4\t😲 EM 3\t😊 EM 3\t😰 EM -2\t😖 EM -2\t😕 EM -2\t😢 EM -2\t😿 EM -2\t😞 EM -2\t😥 EM -1\t😵 EM -1\t😑 EM 0\t😨 EM -2\t😳 EM -2\t😦 EM -1\t😬 EM -2\t😁 EM -1\t😀 EM 3\t😍 EM 4\t😻 EM 4\t😯 EM -1\t👿 EM -5\t😇 EM 4\t😂 EM 4\t😹 EM 4\t😗 EM 3\t😽 EM 3\t😚 EM 3\t😘 EM 4\t😙 EM 3\t😆 EM 1\t😷 EM -1\t😐 EM 0\t😶 EM 0\t😮 EM -2\t😔 EM -1\t😣 EM -2\t😾 EM -5\t😡 EM -5\t😌 EM 3\t😱 EM -4\t🙀 EM -4\t😴 EM 0\t😪 EM 0\t😄 EM 3\t😸 EM 3\t😃 EM 3\t😺 EM 3\t😈 EM -4\t😏 EM 3\t😼 EM 3\t😭 EM -4\t😛 EM 1\t😝 EM 0\t😜 EM -1\t😎 EM 1\t😓 EM -1\t😅 EM 3\t😫 EM -2\t😤 EM 5\t😒 EM -2\t😩 EM -2\t😉 EM 4\t😟 EM -4\t😋 EM 4\t>( EM -4\t>[ EM -4\t>-( EM -4\t>-[ EM -4\t>=( EM -4\t>=[ EM -4\t>=-( EM -4\t>=-[ EM -4\t\\) EM 3\t\\] EM 3\t-\\) EM 3\t-\\] EM 3\t=\\) EM 3\t=\\] EM 3\t=-\\) EM 3\t=-\\] EM 3\t\\\\ EM -2\t-/ EM -2\t-\\\\ EM -2\t=/ EM -2\t=\\\\ EM -2\t=-/ EM -2\t=-\\\\ EM -2\t-( EM -2\t-[ EM -2\t-| EM -2\t'( EM -2\t'[ EM -2\t'| EM -2\t'-( EM -2\t'-[ EM -2\t'-| EM -2\t=( EM -2\t=[ EM -2\t=| EM -2\t=-( EM -2\t=-[ EM -2\t=-| EM -2\t='( EM -2\t='[ EM -2\t='| EM -2\t='-( EM -2\t='-[ EM -2\t='-| EM -2\t-( EM\t-[ EM\t=( EM\t=[ EM\t=-( EM\t=-[ EM\t]( EM -5\t][ EM -5\t]-( EM -5\t]-[ EM -5\t]=( EM -5\t]=[ EM -5\t]=-( EM -5\t]=-[ EM -5\to) EM 4\to] EM 4\to-) EM 4\to-] EM 4\to=) EM 4\to=] EM 4\to=-) EM 4\to=-] EM 4\t0) EM 4\t0] EM 4\t0-) EM 4\t0-] EM 4\t0=) EM 4\t0=] EM 4\t0=-) EM 4\t0=-] EM 4\t-) EM 4\t-] EM 4\t') EM 4\t'] EM 4\t'-) EM 4\t'-] EM 4\t=) EM 4\t=] EM 4\t=-) EM 4\t=-] EM 4\t=') EM 4\t='] EM 4\t='-) EM 4\t='-] EM 4\t-* EM 3\t=* EM 3\t=-* EM 3\tx) EM 1\tx] EM 1\tx-) EM 1\tx-] EM 1\t-| EM\t=| EM\t=-| EM\t-o EM -2\t-0 EM -2\t=o EM -2\t=0 EM -2\t=-o EM -2\t=-0 EM -2\t-@ EM -5\t=@ EM -5\t=-@ EM -5\t-) EM\t-] EM\t=) EM\t=] EM\t=-) EM\t=-] EM\t]) EM -4\t]] EM -4\t]-) EM -4\t]-] EM -4\t]=) EM -4\t]=] EM -4\t]=-) EM -4\t]=-] EM -4\t'( EM\t'[ EM\t'-( EM\t'-[ EM\t'( EM\t'[ EM\t'-( EM\t'-[ EM\t='( EM\t='[ EM\t='-( EM\t='-[ EM\t='( EM\t='[ EM\t='-( EM\t='-[ EM\t-p EM 1\t-d EM 1\t=p EM 1\t=d EM 1\t=-p EM 1\t=-d EM 1\tx-p EM 0\tx-d EM 0\t;p EM -1\t;d EM -1\t;-p EM -1\t;-d EM -1\t8) EM 1\t8] EM 1\t8-) EM 1\t8-] EM 1\t-( EM\t-[ EM\t=( EM\t=[ EM\t=-( EM\t=-[ EM\t'( EM\t'[ EM\t'-( EM\t'-[ EM\t'=( EM -1\t'=[ EM -1\t'=-( EM -1\t'=-[ EM -1\t-) EM\t-] EM\t=) EM\t=] EM\t=-) EM\t=-] EM\t') EM\t'] EM\t'-) EM\t'-] EM\t'=) EM 3\t'=] EM 3\t'=-) EM 3\t'=-] EM 3\t-$ EM -2\t-s EM -2\t-z EM -2\t=$ EM -2\t=s EM -2\t=z EM -2\t=-$ EM -2\t=-s EM -2\t=-z EM -2\t:) EM 3\t:] EM 3\t:[ EM -3\t:( EM -3\t:| EM -1\t:/ EM -1\t:d EM 4\t:s EM 0\t:o EM -1\t:-) EM 3\t:-( EM -3\t:-| EM -1\t:-/ EM -1\t:-d EM 3\t:-p EM 3\t^^ EM 2\t;) EM 4\t;] EM 4\t;-) EM 4\t;-] EM 4\t<3 EM 3\twtf UH -4\tbrb UH 0\tbtw UH 0\tb4n UH 0\tbcnu UH 0\tbff UH 0\tcya UH 0\tdbeyr UH -1\tily UH 2\tlmao UH 2\tlol UH 3\tnp UH 0\toic UH 0\tomg UH 0\trotflmao UH 4\tstby UH -2\tswak UH 2\ttfh UH -2\trtm UH -1\trtfm UH -2\tttyl UH 0\ttyvm UH 2\twywh UH 2\txoxo UH 2\tgah UH -1\tyuck UH -2\tew UH -1\teww UH -2\tabductions - -2\tabhors - -3\tabsolves - 2\tacquits - 2\tacquitting - 2\tadmonish - -2\tagog - 2\tagonise - -3\tagonised - -3\tagonises - -3\tagonising - -3\talarmists - -2\tamazes - 2\tapeshit - -3\tapologise - -1\tapologised - -1\tapologises - -1\tapologising - -1\tappeases - 2\tashame - -2\tassfucking - -4\tasshole - -4\taxed - -1\tbadass - -3\tbamboozle - -2\tbamboozles - -2\tbankster - -3\tbenefitted - 2\tbenefitting - 2\tbereave - -2\tbereaved - -2\tbereaves - -2\tbereaving - -2\tblah - -2\tblesses - 2\tbummer - -2\tcalms - 2\tchagrined - -2\tcharmless - -3\tchastise - -3\tchastising - -3\tcheerless - -2\tchokes - -2\tclueless - -2\tcocksucker - -5\tcocksuckers - -5\tcollide - -1\tcollides - -1\tcolliding - -1\tcolluding - -3\tcombats - -1\tconciliated - 2\tconciliates - 2\tconciliating - 2\tconflictive - -2\tcongrats - 2\tconsolable - 2\tcontagions - -2\tcontestable - -2\tcontroversially - -2\tcrazier - -2\tcraziest - -2\tcunt - -5\tdaredevil - 2\tdegrades - -2\tdehumanizes - -2\tdehumanizing - -2\tdeject - -2\tdejected - -2\tdejecting - -2\tdejects - -2\tdenier - -2\tdeniers - -2\tderails - -2\tderides - -2\tderiding - -2\tdick - -4\tdickhead - -4\tdiffident - -2\tdipshit - -3\tdireful - -3\tdiscarding - -1\tdiscards - -1\tdisconsolate - -2\tdisconsolation - -2\tdisguising - -1\tdisparages - -2\tdisputing - -2\tdisregards - -2\tdisrespected - -2\tdistracts - -2\tdistrustful - -3\tdodgy - -2\tdolorous - -2\tdouche - -3\tdouchebag - -3\tdouchebaggery - -3\tdownhearted - -2\tdroopy - -2\tdumbass - -3\tdupe - -2\teery - -2\tembarrasses - -2\tenlightens - 2\tenrages - -2\tenraging - -2\tenrapture - 3\tenslaves - -2\tenthral - 3\tenvies - -1\tenvying - -1\teviction - -1\texaggerates - -2\texhilarates - 3\texonerates - 2\texpels - -2\texultant - 3\tfag - -3\tfaggot - -3\tfaggots - -3\tfainthearted - -2\tfatiguing - -2\tfavorited - 2\tfidgety - -2\tfraudster - -4\tfraudsters - -4\tfraudulence - -4\tfrikin - -2\tftw - 3\tfucked - -4\tfucker - -4\tfuckers - -4\tfuckface - -4\tfuckhead - -4\tfucking - -2\tfucktard - -4\tfud - -3\tfuked - -4\tfuking - -4\tgallantly - 3\tglamourous - 3\tgreenwash - -3\tgreenwasher - -3\tgreenwashers - -3\tgreenwashing - -3\thaha - 3\thahaha - 3\thahahah - 3\thaplessness - -2\theartbroken - -3\theavyhearted - -2\thoax - -2\thonouring - 2\thooligan - -2\thooligans - -2\thumerous - 3\thumourous - 2\thysterics - -3\tinconsiderate - -2\tindoctrinate - -2\tindoctrinates - -2\tinfatuated - 2\tinfuriates - -2\tinnovates - 1\tinquisition - -2\tjackasses - -4\tjesus - 1\tlaughting - 1\tlawl - 3\tlifesaver - 4\tlmfao - 4\tloathe - -3\tlooses - -3\tlugubrious - -2\tmirthful - 3\tmirthfully - 3\tmisbehave - -2\tmisbehaved - -2\tmisbehaves - -2\tmischiefs - -1\tmisgiving - -2\tmisreporting - -2\tmocks - -2\tmongering - -2\tmonopolizes - -2\tmope - -1\tmoping - -1\tmoron - -3\tmotherfucker - -5\tmotherfucking - -5\tmumpish - -2\tn00b - -2\tnaïve - -2\tnegativity - -2\tniggas - -5\tnoob - -2\tnosey - -2\toffline - -1\toptionless - -2\toverreacts - -2\toversell - -2\toverselling - -2\toversells - -2\toversimplifies - -2\toversimplify - -2\toverstatements - -2\toxymoron - -1\tpardoning - 2\tpensive - -1\tperfects - 2\tpersecutes - -2\tpesky - -2\tphobic - -2\tpissed - -4\tpissing - -3\tpollutes - -2\tpostpones - -1\tprblm - -2\tprblms - -2\tproactive - 2\tprofiteer - -2\tprosecutes - -1\tpseudoscience - -3\trageful - -2\tranter - -3\tranters - -3\trants - -3\traptured - 2\trapturous - 4\treassures - 1\tregretful - -2\tregretting - -2\trepulse - -1\trevengeful - -2\trofl - 4\troflcopter - 4\trotfl - 4\trotflmfao - 4\trotflol - 4\tsadden - -2\tscumbag - -4\tsecures - 2\tshithead - -4\tshitty - -3\tshort-sighted - -2\tshort-sightedness - -2\tshrew - -4\tsingleminded - -2\tslickest - 2\tslut - -5\tspam - -2\tspammer - -3\tspammers - -3\tspamming - -2\tspiteful - -2\tstarves - -2\tstressor - -2\tswindle - -3\tswindles - -3\ttard - -2\tterrorizes - -3\tthwarts - -2\ttorturing - -4\ttwat - -5\tuncredited - -1\tunderestimating - -1\tundeserving - -2\tunemploy - -2\tunintelligent - -2\tunloved - -2\tunresearched - -2\tvalidates - 1\tvexation - -2\tvictimizing - -3\tvindicates - 2\tvindicating - 2\tvisioning - 1\twanker - -3\twinwin - 3\twoohoo - 3\twooo - 4\twoow - 4\twow - 4\twowow - 4\twowww - 4\tyeees - 2\tyucky - -2\tzealots - -2\t☺️ - 3\tcold_sweat - -2\tcrying_cat_face - -2\tdisappointed_relieved - -1\tdizzy_face - -1\tgrimacing - -2\theart_eyes - 4\theart_eyes_cat - 4\timp - -5\tjoy_cat - 4\tkissing_cat - 3\tkissing_closed_eyes - 3\tkissing_heart - 4\tkissing_smiling_eyes - 3\tneutral_face - 0\tno_mouth - 0\topen_mouth - -2\tpouting_cat - -5\tscream_cat - -4\tsmile_cat - 3\tsmiley - 3\tsmiley_cat - 3\tsmiling_imp - -4\tsmirk_cat - 3\tstuck_out_tongue - 1\tstuck_out_tongue_closed_eyes - 0\tstuck_out_tongue_winking_eye - -1\tsweat_smile - 3\ttired_face - -2\tyum - 4\t - undefined");
}(),!function(){var e={'"':/(&quot;|\u201C|\u201D)/gi,"&":/&amp;/gi,"'":/(&#x27;|\u2018|\u2019)/gi,"<":/&lt;/gi,">":/&gt;/gi,"`":/&#x60/gi,shit:/(s\&\^t|sh\*t)/gi,fuck:/(f\*ck)/gi,"just kidding":"j/k",without:/w\/[to]/g,"with":"w/"," out of ":/\soutta\s/gi};t.decode=function(t){var i;for(i in e)e.hasOwnProperty(i)&&(t=t.replace(e[i],i));return t}}(),function(){function t(t,e,i){var n,s,r,a,o="string"==typeof e,J=i.length-(o?1:2);for(J;J>=0;J-=1)r=i[J],o?e===r.type&&(r.type=t):(a=i[J+1],n=e.indexOf(r.type),s=e.indexOf(a.tags[0]),n>-1&&s>-1&&n<=s&&(r.type=t,r.to=a.to,r.tags=r.tags.concat(a.tags),i.splice(J+1,1)))}function i(e){var i,n=d.length;for(i=0;i<n;i+=1)t(d[i][0],d[i][1],e)}function n(t,e,i){var n,s,r,a=N.length;for(n=0;n<a;n+=1)if(s=N[n][0],r=N[n][1],!(N[n].length>4&&i<N[n][4])&&s===t&&r===e)return[N[n][2],N[n][3]];return-1}function s(t,e){var i,s,r,a;for(i=t.length-2;i>=0;i-=1)if(r=t[i],a=t[i+1],s=n(r.type,a.type,e),0===s[0])r.right.push(a),t.splice(i+1,1),a.label=s[1];else if(1===s[0]){if("NSUBJ"===s[1]&&o("NSUBJ",a.left))continue;a.left.push(r),t.splice(i,1),r.label=s[1]}}function r(t,e,i){var n=t[0],s=t.length;if("VP"===n.type&&!o("NSUBJ",n.left)&&!o("NSUBJ",n.right)){var r=o("DOBJ",t[0].right);r&&(r.label="NSUBJ")}2===s&&"PUNCT"===t[1].type&&(n.right.push(t[1]),t[1].label="PUNCT",t.splice(1,1)),a(t,e,i)}function a(t,e,i){var n,s,r,o,J=0,l=t.length;for(J;J<l;J+=1){for(n=t[J],r="",o="",s=n.from;s<=n.to;s+=1)r+=" "+i.tokens[s].raw,o+=" "+i.tokens[s].norm;n.raw=r.slice(1),n.norm=o.slice(1),a(n.left,e,i),a(n.right,e,i),n.left.sort(function(t,e){return t.from-e.from}),n.right.sort(function(t,e){return t.from-e.from})}}function o(t,e){for(var i=0,n=e.length;i<n;i+=1)if(e[i].label===t)return e[i];return null}function J(t,e,i,n){return{meta:{},left:[],right:[],tags:n||[t],from:e,to:i,raw:null,norm:null,type:t,is:null}}e(l,{parse:function(t){var e,n=t.tags,a=(J("ROOT"),t.length),o=0,l=[];for(e=0;e<a;e+=1)l[e]=J(n[e],e,e);for(i(l);o<10&&l.length>1;)s(l,o),o+=1;r(l,n,t),t.root=l[0],t.root.label="ROOT",l.length>1},connect:function(t){}});var d=[["NP",["NNP","CD","NNS"]],["NP",["DT","PRP$","JJ","JJS","$","CD","$","NN","NNS"]],["NP",["DT","PRP$","JJ","JJS","$","CD","$","NNP","NNPS"]],["VP",["MD","VBP","VB"]],["VP",["MD","VBD"]],["VP",["VBZ","VBG"]],["NP",["NNP","NNPS"]],["ADV",["RB","RB"]],["ADJP",["RB","JJ"]],["PP","IN"],["PRT","RP"],["NP","PRP"],["NP","NNP"],["NP","NNPS"],["NP","NN"],["NP","DT"],["ADJ","JJ"],["NP","NNS"],["VAUX",["VB","RB"]],["VAUX",["VBP","RB"]],["VP","VBZ"],["VP","VBP"],["VP","VBD"],["ADV","WRB"],["ADV","RB"],["PUNCT","."],["PUNCT",","],["SP",["PP","NP"]]],N=[["NP","VP",1,"NSUBJ"],["VP","NP",0,"DOBJ"],["VB","NP",0,"DOBJ"],["PP","NP",0,"POBJ"],["NP","PP",0,"PREP"],["VP","PP",0,"PREP"],["VB","PP",0,"PREP"],["VP","VP",0,"CCOMP"],["VP","ADV",0,"ADVMOD"],["VB","ADV",0,"ADVMOD"],["ADV","PP",0,"PREP"],["PP","VP",1,"PREP"],["VP","ADJ",0,"ACOMP"],["VB","ADJ",0,"ACOMP"],["VB","VP",1,"AUX"],["VAUX","VP",1,"AUX"],["VAUX","VB",1,"AUX"],["VP","PUNCT",0,"PUNCT",1],["VB","PUNCT",0,"PUNCT",1],["PUNCT","VP",1,"PUNCT",1],["PUNCT","VB",1,"PUNCT",1],["ADV","VP",1,"ADVMOD",2],["ADV","VB",1,"ADVMOD",2],["ADV","ADV",1,"ADVMOD",2]]}(),!function(){var t=[["VBZ","VBP","VBD","VBG"],["MD","VB"],["NNP","NNPS","NN","NNS"],["WP","WRB"],["UH"]],i="unknown",n=[["NNP","NNP","compound"],["PRP","VBZ","subj"],["PRP","VBP","subj"],["PRP","VBD","subj"],["DT","VBZ","subj"],["DT","VBP","subj"],["DT","VBD","subj"],["WRB","VBP","attr"],["WRB","VBZ","attr"],["WRB","VBD","attr"],["VBG","VBP"],["TO","VB"],["TO","NN"],["TO","NNS"],["DT","NN","det"],["DT","NNP","det"],["PRP$","NN","poss"],["RB","JJ","advmod"],["JJ","NN","amod"],["JJ","NNS","amod"],["JJ","NNP","amod"],["VBG","JJ"],["NN","VBZ","subj"],["NN","VBP","subj"],["NN","VBD","subj"],["NN","VB","subj"],["NNP","VBZ","subj"],["NNP","VBP","subj"],["NNP","VBD","subj"],["NNP","VB","subj"]],s=[["PRP","VBZ","obj"],["PRP","VBP","obj"],["PRP","VBD","obj"],["NN","IN","obj"],["IN","VBZ"],["IN","VBP"],["IN","VBD"],["IN","VBG"],["JJ","VBD","acomp"],["JJ","VBP","acomp"],["JJ","VBZ","acomp"],["IN","VB"],["CC","JJ"],["NNP","VB","obj"],["NN","VB","obj"],["VB","VB","xcomp"]],r=20;e(J,{expand:function(t,e){var a,o,J,l,d,N,u=t.length,c=n.length,p=0,B=!1;for(a=0;a<u-e;a++,p=0)if(N=t.tokens[a],"number"!=typeof N.deps.master&&(l=t.tokens[a+e],N.deps.master!==l.deps.master&&"number"==typeof l.deps.master))for(;(d=t.tokens[l.deps.master])&&l!==d&&l.deps.master&&N.deps.master!==l.deps.master&&(p++,!(p>r));){for(J=N.pos,o=0;o<c;o++)if(J===n[o][0]&&d.pos===n[o][1]){N.deps.master=l.deps.master,N.deps.type=n[o][2]||i,B=!0;break}if(B)break;l=d}for(a=u-1,c=s.length;a>e;a--)if(N=t.tokens[a],"number"!=typeof N.deps.master&&(l=t.tokens[a-e],"number"==typeof l.deps.master&&N.deps.master!==l.deps.master))for(d=t.tokens[l.deps.master],J=N.pos,o=0;o<c;o++)if(J===s[o][0]&&d.pos===s[o][1]){N.deps.master=l.deps.master,N.deps.type=s[o][2]||i,B=!0;break}return B},parse:function(e){var a,o,J,l,d,N=e.length,u=n.length,c=0,p=!0,B=null,g=null,V=0,h=0;if(1===N)return d=e.tokens[0],d.deps.governor=!0,void(e.governor=0);for(a=0;a<N-1;a++)if(d=e.tokens[a],l=e.tags[a+1],J=d.pos,t[V].indexOf(J)>-1)null===B?(B=a,g=a):d.deps.master=B;else for(o=0;o<u;o++)if(J===n[o][0]&&l===n[o][1]){d.deps.master=a+1,d.deps.type=n[o][2]||i;break}for(a=N-1;a>=0;a--)d=e.tokens[a],l=e.tokens[a+1],a!==B&&("compound"===d.deps.type||"det"===d.deps.type?(null!==B&&B<a&&"number"!=typeof l.deps.master&&(l.deps.master=B,l.deps.type="obj"),h+=1,h>1&&(d.deps.master=l.deps.master)):h=0);for(a=N-1,u=s.length;a>0;a--)if(d=e.tokens[a],"number"!=typeof d.deps.master)for(l=e.tags[a-1],J=d.pos,o=0;o<u;o++)if(J===s[o][0]&&l===s[o][1]){d.deps.master=a-1,d.deps.type=s[o][2]||i;break}for(;p&&c<r;){for(p=!1,a=1;a<5;a+=1)p=this.expand(e,a)||p;c+=1}for(u=t.length-1;null===B&&V<u;)for(V++,a=0;a<N;a++)if(t[V].indexOf(e.tags[a])>-1){B=a;break}for(null!==B&&(e.governor=B,e.tokens[B].deps.governor=!0),this.reconnect(e),a=0;a<N;a++)d=e.tokens[a],a!==B&&(null!==d.deps.master&&d.deps.master!==a||(d.deps.master=B),null!==d.deps.master&&e.tokens[d.deps.master].deps.dependencies.push(a),"subj"===d.deps.type?e.deps.subjects.push(a):"obj"===d.deps.type&&e.deps.objects.push(a))},reconnect:function(t){var e,n,r,a,o,J,l,d=t.length,N=s.length;for(e=d-1;e>=0;e--)if(l=t.tokens[e],l.deps.governor!==!0&&"number"!=typeof l.deps.master){for(r=e,J=e;J===e&&(r--,r!==-1);)J=t.tokens[r].deps.master;if(r!==-1)for(o=t.tags[r],a=l.pos,n=0;n<N;n++)if(a===s[n][0]&&o===s[n][1]){l.deps.master=r,l.deps.type=s[n][2]||i;break}}}})}(),!function(){var t={t:[],s:[]},e={t:[],s:[],p:[]},i=[];o.init=function(t){i.push(t)},o.context=function(){var t,e={},n=i.length;for(t=0;t<n;t+=1)i[t](e);return e},o.before=function(e,i,n){"function"==typeof i&&(n=i,i=null),t.hasOwnProperty(e)?t[e].push({id:i,cb:n}):console.warn("No detector with type "+e)},o.add=function(t,e,i){return"function"==typeof e&&(i=e,e=null),console.warn("compendium.detectors.add is a deprecated function - please use compendium.detectors.after"),o.after(t,i)},o.after=function(t,i,n){"function"==typeof i&&(n=i,i=null),e.hasOwnProperty(t)?e[t].push({id:i,cb:n}):console.warn("No detector with type "+t)},o.apply=function(i,n,s){var r,a,o,J=Array.prototype.slice.call(arguments).slice(3),l=n?t:e;if(s=s||[],l.hasOwnProperty(i))for(r=0,a=l[i].length;r<a;r++)o=l[i][r],s.indexOf(o.id)===-1&&o.cb.apply(null,J)}}(),!function(){var t=function(t,e){if(e>=t.length)return!1;var i=t.tags[e+1];return"NNP"===i||"NNPS"==i},e=function(t,e){return"&"===t||"TO"===t||"CC"===t&&"or"!==e};o.before("s","entities",function(i,n,s){var a,o,J,l,d,N,u=i.length,c=i.stats;if(!(c.p_upper>75||c.p_cap>85))for(a=0;a<u;a++)o=i.tags[a],J=i.tokens[a],l=J.norm,J.attr.entity>-1?N=null:"NN"===o?N=null:"NNP"===o||"NNPS"===o||N&&e(o,l)&&t(i,a)?N?(N.raw+=" "+J.raw,N.norm+=" "+J.norm,N.toIndex=a,J.attr.entity=d):(N=r.entity(J,a),d=J.attr.entity=i.entities.push(N)-1):N=null})}(),!function(){var t=Object.keys(n.neg).concat(Object.keys(n.refusal)),e=Object.keys(n.neg_neg),i=[["but","to"]];o.after("s","negation",function(n,s,r){var a,o,J,l,d,N=n.length,u=i.length,c=!1,p=0,B=0;for(a=0;a<N;a++){if(d=n.tokens[a],l=n.tokens[a+1],d.profile.breakpoint||d.attr.is_punc)p=0,c=!1;else if(t.indexOf(d.norm)>-1)c?c=!1:(J=n.tokens[a-1],"RB"===d.pos&&J&&(J.attr.is_verb||"MD"===J.pos)&&(J.profile.negated=!0),B++,c=!0);else if(c&&e.indexOf(d.norm)>-1&&0===p)n.tokens[a-1].profile.negated=!1,B--,c=!1;else if(c){for(o=0;o<u&&a<N-1;o+=1)if(d.norm===i[o][0]&&l.norm===i[o][1]){c=!1;break}c&&(B++,p++)}d.profile.negated=c}n.profile.negated=B>0})}(),!function(){var t=["WP","WP$","WRB"];o.after("s","type",function(e,i){var n,s,r,a,o=e.length,J=e.stats,l=e.governor,d=e.profile.types,N=e.tokens[0],u=e.tokens[o-1];if(o>2&&(J.p_foreign>=10&&J.confidence<.5||J.confidence<=.35)&&d.push(p),J.p_cap>75&&J.p_upper<50&&o>10&&d.push(V),"!"===u.norm)d.push(g);else if("?"===u.norm||t.indexOf(N.pos)>-1&&0===J.breakpoints)d.push(B);else if(l>-1)if(n=e.tags[l],t.indexOf(n)>-1)d.push(B);else if("."!==u.pos&&0===n.indexOf("VB"))if("PRP"===e.tags[l+1]&&0===(e.tags[l+2]||"").indexOf("VB")&&d.push(B),l>1&&"PRP"===e.tags[l-1]&&0===e.tags[l-2].indexOf("VB"))d.push(B);else if("PRP"===e.tags[l-1]&&"MD"===e.tags[l-2])d.push(B);else for(s=e.tokens[l].deps.dependencies,r=0,a=s.length;r<a;r++)t.indexOf(e.tags[s[r]])>-1&&(e.tags[s[r]-1]||"").indexOf("VB")<0&&d.push(B);l>-1&&d.indexOf(B)===-1&&"VB"===e.tags[l]&&d.push(h)})}(),!function(){var t=n.dirty,e=n.polite,i=n.emphasis,s=["wo","'ll","will"],r=function(t,e){var i,n,s=e.deps.dependencies,a=s.length,o=0;if(0!==a){for(i=0;i<a;i+=1)n=t.tokens[s[i]],r(t,n),o+=n.profile.sentiment;e.profile.sentiment+=parseInt(o/a*100)/100}};o.after("s","sentiment",function(n,a,o){var J,l,d,N,u,p,g,V=n.length,h=0,f=1,m=0,b=0,v=0,y=0,w=0,k=0,P=0,R=n.governor,M=n.profile;for(J=0;J<V;J++)l=n.tokens[J].profile,N=n.tokens[J].pos,u=n.tokens[J].norm,g=t.indexOf(u)>-1,p=e.indexOf(u)>-1,g?w++:p&&y++,l.negated&&"."!==N&&"EM"!==N&&(g?l.sentiment=l.sentiment/2:l.sentiment=-l.sentiment/2);for(R>-1&&(d=n.tokens[R],r(n,d),N=d.pos,d.attr.is_verb?M.main_tense="VBD"===N?"past":"present":"MD"===N&&s.indexOf(d.norm)>-1&&(M.main_tense="future")),n.stats.p_upper>70&&(f=1.2),J=0;J<V;J++)l=n.tokens[J].profile,N=n.tokens[J].pos,u=n.tokens[J].norm,f*=l.emphasis,("JJS"===N||"RB"===N&&i.indexOf(u)>-1)&&(v+=l.negated?2:5),m=l.sentiment*(1+v/10),h+=m,m>P?P=m:m<k&&(k=m),l.emphasis*=1+v/10,v>0&&["DT","POS","IN"].indexOf(N)===-1&&v--;V<5?V*=2:V>10&&(V/=2),b=(P+-k)/V,h*=f,h/=V,M.types.indexOf(B)>-1&&(h/=2),M.sentiment=h,M.emphasis=f,M.amplitude=b,M.dirtiness=w/V,M.politeness=y/V,Math.abs(b)>.5&&Math.abs(h)<.5&&Math.abs(b)>Math.abs(h)?M.label="mixed":h<=c.profile.negative_threshold?M.label="negative":h>=c.profile.positive_threshold?M.label="positive":b>=c.profile.amplitude_threshold&&(M.label="mixed")})}(),!function(){var t=Object.keys(n.approval),e=Object.keys(n.refusal);o.after("s","type",function(i,s){var r,a,o,J=i.tokens[0],l=i.profile,d=i.governor>-1?i.tokens[i.governor]:null,N=d?d.deps.dependencies:null,u=i.stats.words,c=l.types;if(!(c.indexOf(B)>-1)){if(e.indexOf(J.norm)>-1)c.push(m);else if(1===u&&"JJ"===J.pos&&l.sentiment<0)c.push(m);else if(d)if(e.indexOf(d.norm)>-1)c.push(m);else if(c.indexOf(h)>-1&&n.approval_verbs.indexOf(d.norm)>-1&&d.profile.negated)c.push(m);else if("UH"===d.pos)for(a=0,o=N.length;a<o;a+=1)r=i.tokens[N[a]],("UH"===r.pos||"RB"===r.pos)&&e.indexOf(r.norm)>-1&&c.push(m);if(!(c.indexOf(m)>-1))if(t.indexOf(J.norm)>-1)c.push(f);else if(1===u&&"JJ"===J.pos&&l.sentiment>0)c.push(f);else if(d&&u<=3)if(t.indexOf(d.norm)>-1)c.push(f);else if(c.indexOf(h)>-1&&n.approval_verbs.indexOf(d.norm)>-1)c.push(f);else if("UH"===d.pos)for(a=0;a<o;a+=1)r=i.tokens[N[a]],"UH"===r.pos&&t.indexOf(r.norm)>-1&&c.push(f)}})}(),!function(){var t=n.floatChar,e=n.thousandChar,i=/[0-9]/,s=/^-?[0-9]+$/,r=new RegExp("^-?[0-9]*\\"+t+"[0-9]+$"),a=new RegExp("^-?[0-9]+([\\"+e+"][0-9]+){1,}$"),J=new RegExp("^-?[0-9]+([\\"+e+"][0-9]+){1,}(\\"+t+"[0-9]+)$"),l=new RegExp("\\"+e,"g"),d=n.numbers,N=n.multipliers,u=function(t){var e=t.norm;if(e.match(i)){if(e.match(s))return parseInt(e,10);if(e.match(r))return parseFloat(e);if(e.match(J))return parseFloat(e.replace(l,""));if(e.match(a))return parseInt(e.replace(l,""),10)}return e=t.attr.singular,d.hasOwnProperty(e)?d[e]:null},c=function(t,e){var i,n,s,r=e[2],a=e[1],o=0;if(1===e[1])return i=r[0],u(i);for(n=0;n<a;n+=1){if(i=r[n],s=u(i),null===s)return null;N.indexOf(i.attr.singular)>-1?o*=s:o+=s}return o},p=function(t,e){var i,n=t[2],s=n.length;for(i=0;i<s;i+=1)n[i].attr.value=e};o.before("s","numeric",function(t,e,i,n){for(var s,r,a=n.numericSections,o=a.length,s=0;s<o;s+=1)r=c(t,a[s]),null!==r&&p(a[s],r)})}(),!function(){var e=t.lexicon;o.before("t","basics",function(i,s,r){var a,o,J,l,N=i.raw,u=i.norm,c=i.stem,p=i.pos,B=0,g=1;o=N.toLowerCase(),J=o.length,J>1&&N.indexOf(".")===J-1&&(l=n.abbrs.indexOf(o.slice(0,J-1)))>-1?(i.attr.abbr=!0,u=n.abbrs_rplt[l]):N.match(/^([a-z]{1}\.)+/gi)?i.attr.acronym=!0:u=t.synonym(u),"."===p?(l=N[0],"!"===l||"?"===l?(g=N.length>1?2:"?"===l?1:1.5,N.length>1&&(u=N[0])):"."===l&&"."===N[1]&&(g=1.2,u="...")):"EM"===p?g=1.2:"UH"===p?g=1.1:0===p.indexOf("VB")?i.attr.infinitive=d.infinitive(u):"NNS"===p||"CD"===p?(a=d.singularize(u),i.attr.singular=a):"NN"===p&&(i.attr.singular=u),"NNP"!==p&&"NNPS"!==p&&"IN"!==p&&(e.hasOwnProperty(u)?(l=e[u],l.condition&&i.pos!==l.condition||(B=l.sentiment)):"NNS"===p&&e.hasOwnProperty(a)?(l=e[a],l.condition&&p!==l.condition||(B=l.sentiment/2)):e.hasOwnProperty(c)?(l=e[c],l.condition&&p!==l.condition||(B=l.sentiment/2)):n.dirty.indexOf(u)>-1?B=-2:n.polite.indexOf(u)>-1&&(B=1)),i.profile.sentiment=B,i.profile.emphasis=g,i.norm=u})}(),!function(){var t=[",",":",";","("],e=["-","—","/"];o.before("t","breakpoint",function(i,n,s){var r=i.raw,a=i.pos;(t.indexOf(a)>-1||e.indexOf(r)>-1)&&(i.profile.breakpoint=!0,s.stats.breakpoints++)})}(),!function(){o.before("t","entities",function(e,i,s){var a,o,J,l,d,N=t.lexer.regexps,u=" "+e.norm+" ";for(a in N)N.hasOwnProperty(a)&&u.match(N[a])&&(o=r.entity(e,i,a),e.attr.entity=s.entities.push(o)-1,"username"!==o.type&&"composite"!==a||(e.pos="NNP",s.tags[i]="NNP"),s.stats.confidence+=1/s.length,"pl"===a&&(o.type="political_affiliation",J=e.norm.split("-"),d=J[1].length,"d"===J[0]?o.meta.party="democrat":o.meta.party="republican",l="."===J[1][d-1]?n.abbrs.indexOf(J[1].slice(0,d-1)):n.abbrs.indexOf(J[1]),l>-1&&(J[1]=n.abbrs_rplt[l]),e.norm=o.meta.party+", "+J[1]))})}(),!function(){var t=n.numbers;o.init(function(t){t.numericSections=[],t.inNumericSection=!1}),o.before("t","numeric",function(e,i,n,s){var r=e.pos,a=s.numericSections;"CD"===r||"NNS"===r&&t.hasOwnProperty(e.attr.singular)?s.inNumericSection?(a[a.length-1][1]+=1,a[a.length-1][2].push(e)):(s.numericSections.push([i,1,[e]]),s.inNumericSection=!0):s.inNumericSection&&(s.inNumericSection=!1)})}(),!function(){var i=[",",".",":",'"',"(",")"];e(r,{entity:function(t,e,i){return{raw:t.raw,norm:t.norm,fromIndex:e,toIndex:e,type:i||null,meta:{}}},sentence:function(t,e){return{language:e,time:0,length:0,governor:-1,raw:t,stats:{words:0,confidence:0,p_foreign:0,p_upper:0,p_cap:0,avg_length:0,breakpoints:0},profile:{label:"neutral",sentiment:0,emphasis:1,amplitude:0,politeness:0,dirtiness:0,types:[],main_tense:"present"},has_negation:!1,entities:[],deps:{subjects:[],objects:[]},root:null,tokens:[],tags:[]}},token:function(e,n,s){var r=null,a=0===s.indexOf("VB");return n=n.toLowerCase(),r="VBD"===s||"VBN"===s?"past":"VBG"===s?"gerund":"present",{raw:e,norm:n,stem:t.stemmer(n),pos:s||"",profile:{sentiment:0,emphasis:1,negated:!1,breakpoint:!1},attr:{value:null,acronym:!1,abbr:!1,is_verb:a,tense:r,infinitive:null,is_noun:0===s.indexOf("NN"),plural:null,singular:null,entity:-1,is_punc:i.indexOf(s)>-1},deps:{master:null,governor:!1,type:"unknown",dependencies:[]}}},tag:function(t,e,i){return{tag:t||"NN",norm:i,confidence:e||0,blocked:!1}}})}(),!function(){var r,a,o=n.abbrs,J=/(\S.+?[….\?!\n])(?=\s+|$|")/g,l=new RegExp("(^| |\\(|\\[|{)("+o.join("|")+")[.!?] ?$","i"),d=" !?()[]{}\"'`%•.…:;,$€£¥\\/+=*_–",N=t.punycode.ucs2,u=n.floatChar,c=n.thousandChar,p=/^-?[0-9]+$/,B=/^[0-9]+$/,g=new RegExp("^-?[0-9]+[.,]$"),V={complexFloat:"\\s(-?[0-9]+([\\"+c+"][0-9]+){1,}(\\"+u+"[0-9]+))"},h={},f=n.emots.length,m=function(t){var e=0,i=t.length;for(e=0;e<i;e+=1)if(null===t[e]||"emoticon"!==t[e].group)return!1;return!0},b=function(t,e,i,n){var s,r,a,o;for(s in i)if(i.hasOwnProperty(s))for(a=new RegExp(i[s],"g");null!==(o=a.exec(t));)r=o[0].length,e[o.index]={content:o[1],type:s,group:n,length:r-(r-o[1].length)}};for(r=0;r<2*f;r+=2)a=n.emots[r/2],h["em_"+r]="\\s("+i(a)+"+)[^a-z]",a.match(/^[a-zA-Z]/)||(h["em_"+(r+1)]="[a-zA-Z]("+i(a)+"+)[^a-z]");e(t.lexer,{regexps:{email:"\\s([^\\s]+@[^\\s]+(\\.[^\\s\\)\\]]+){1,})",composite:"\\s([a-zA-Z]&[a-zA-Z])",username:"\\s(@[a-zA-Z0-9_]+)",html_char:"\\s(&[a-zA-Z0-9]{2,4};)",hashtag:"\\s(#[a-zA-Z0-9_]+)",url:"\\s((https?|ftp):\\/\\/[\\-a-z0-9+&@#\\/%\\?=~_|!:,\\.;]*[\\-a-z0-9+&@#\\/%=~_|])",ip:"\\s(([01]?\\d\\d?|2[0-4]\\d|25[0-5])\\.([01]?\\d\\d?|2[0-4]\\d|25[0-5])\\.([01]?\\d\\d?|2[0-4]\\d|25[0-5])\\.([01]?\\d\\d?|2[0-4]\\d|25[0-5]))\\s",pl:"\\s([rd]-([a-z]+\\.{0,1})+)"},consolidate:function(t,e,i){for(var n=1,s=t.length;n<s;n+=1)m(e[n])&&(t[n-1]=t[n-1].concat(t[n]),i[n-1]+=" "+i[n],t.splice(n,1),e.splice(n,1),i.splice(n,1),n-=1,s-=1);return t},sentences:function(t){var e,i,n=t.split(J),s=n.length,r=[];for(e=0;e<s;e++)i=n[e].trim(),i.match(l)||i.match(/[ |\.][A-Za-z]\.?$/)?e<s-1&&!n[e+1].match(/^[A-Za-z]\s/)?(console.log(i,n[e+1]),n[e+1]=i+" "+n[e+1].trim()):r.push(i):i&&r.push(i);return r},splitTokens:function(t){var e,i,n,r=t.length,a=[],o=[],J=null,l=" "+t+" ",u={},c=function(t){if(t){"object"==typeof t&&(J=t,t=t.content),n=N.decode(t);var e,i=n.length,s="";for(e=0;e<i;e++)n[e]>=128511?(s&&(o.push(J),a.push(s)),o.push({group:"emoticon"}),a.push(N.encode([n[e]])),s=""):s+=N.encode([n[e]]);s&&(o.push(J),a.push(s))}},p=function(t,e){c(t),c(e),i=""};for(b(l,u,s.regexps,"entity"),b(l,u,h,"emoticon"),b(l,u,V,"number"),i="",e=0;e<r;e++)u.hasOwnProperty(e)?(p(i,u[e]),e+=u[e].length-1):d.indexOf(t[e])>-1?p(i,t[e]):i+=t[e];return p(i),{tokens:a,meta:o}},tokens:function(t,e){var i,n,r=s.splitTokens(t),a=r.tokens,J=r.meta,l=a.length,d=!1,N=[],u=[],c="",V="",h=0;for(i=0;i<l;i++)if(n=a[i].trim())if(c=h>0?N[h-1]:"",V=i<l-1?a[i+1]:"",("."===n||","===n)&&c.match(p)&&V.match(B)||n.match(p)&&c.match(g))d=!1,N[h-1]+=n;else if("."===n&&i<l-1&&h>0&&o.indexOf(c.toLowerCase())>-1)d=!1,N[h-1]+=n;else if(d&&i<l-1&&1===n.length)N[h-1]+=n;else{if(n.match(/^\W+$/gi)){if(d=!1,n===c[c.length-1]){N[h-1]+=n;continue}}else n.match(/^[A-Za-z]{1}$/g)&&i<l-1&&"."===V&&(d=!0);n&&(N.push(n),u.push(J[i]),h++)}else d=!1;return{result:s.postprocess(N,u),meta:u}},advanced:function(t,e,i){var n,r,a=s.sentences(t),o=a.length,J=[],l=[];if(i)return{sentences:a,raws:null,meta:null};for(n=0;n<o;n++)l.push(a[n]),r=s.tokens(a[n],e),J[n]=r.meta,a[n]=r.result;return s.consolidate(a,J,l),{raws:l,sentences:a,meta:J}},lex:function(t,e,i){return s.advanced(t,e,i).sentences}}),t.lex=s.lex}(),!function(){var i=["s","m","t","ll","ve","d","em","re"];e(t.lexer,{postprocess:function(t,e){var n,s,r,a,o=t.length,J=[];for(n=0;n<o;n+=1)s=t[n],r=t[n-1]||"",a=t[n+1]||"","'"===s&&i.indexOf(a)>-1?"t"===a&&r.lastIndexOf("n")===r.length-1?(J[n-1]=r.slice(0,-1),J.push("n"+s+a),n+=1):(J.push(s+a),n+=1):"cant"!==s?"cannot"!==s?"gonna"!==s?J.push(s):J.push("gon","na"):J.push("can","not"):J.push("can","n't");return J}})}(),!function(){var i=t.inflector.isPlural,s=0,a=1,o=2,J=3,l=4,d=41,u=5,c=51,p=6,B=8,g=81,V=9,h=11,f=12,m=121,b=13,v=14,y=141,w=15,k=16,P=17,R=171,M=172,E=18,D=19,x=21,Z=t.lexicon,G=n.emots,$=n.rules,S=$.length,O=n.suffixes,I=O.length,z=new RegExp("^-?[0-9]+([\\"+n.thousandChar+"][0-9]+){1,}(\\"+n.floatChar+"[0-9]+)$"),j=function(e){var i,n=e.replace(/(.)\1{2,}/g,"$1$1");return t.lexicon.hasOwnProperty(n)?n:(i=t.synonym(n),i!==n?i:(n=e.replace(/(.)\1{1,}/g,"$1"),t.lexicon.hasOwnProperty(n)?n:(i=t.synonym(n),i!==n?i:null)))},T=function(t){return t.match(/^[A-Z][a-z\.]+$/g)||t.match(/^[A-Z]+[0-9]+$/g)||t.match(/^[A-Z][a-z]+[A-Z][a-z]+$/g)};e(N,{applyRule:function(t,e,i,n,r,N,Z){if(!(t.from!==i||t.secondRun&&0===Z)){var G,$,S=t.type;if(S!==s){if(e=e.toLowerCase(),S===o){if(n>0&&N[n-1]===t.c1)return void(N[n]=t.to)}else if(S===c){if(G=r[n-1]||"",N[n-1]===t.c2&&G.toLowerCase()===t.c1)return void(N[n]=t.to)}else if(S===J){if(N[n+1]===t.c1)return void(N[n]=t.to)}else if(S===l){if(N[n+2]===t.c1)return void(N[n]=t.to)}else if(S===d){if(N[n-2]===t.c1)return void(N[n]=t.to)}else if(S===a){if(N[n-1]===t.c1||N[n-2]===t.c1)return void(N[n]=t.to)}else if(S===u){if(G=r[n-1]||"",G.toLowerCase()===t.c1)return void(N[n]=t.to)}else if(S===p){if(e===t.c1)return void(N[n]=t.to)}else if(S===B){if(e===t.c2&&N[n-1]===t.c1)return void(N[n]=t.to)}else if(S===g){if(G=r[n-1]||"",e===t.c2&&G.toLowerCase()===t.c1)return void(N[n]=t.to)}else if(S===V){if(N[n+1]===t.c1||N[n+2]===t.c1||N[n+3]===t.c1)return void(N[n]=t.to)}else if(S===h){if(G=r[n+2]||"",G.toLowerCase()===t.c1)return void(N[n]=t.to)}else if(S===m){if(G=r[n+1]||"",e===t.c1&&G.toLowerCase()===t.c2)return void(N[n]=t.to)}else if(S===f){if(e===t.c1&&N[n+1]===t.c2)return void(N[n]=t.to)}else if(S===b){if(N[n-1]===t.c1||N[n-2]===t.c1||N[n-3]===t.c1)return void(N[n]=t.to)}else if(S===v){if(N[n-1]===t.c1&&N[n+1]===t.c2)return void(N[n]=t.to)}else if(S===y){if(e===t.c1&&N[n-1]===t.c2&&N[n+1]===t.c3)return void(N[n]=t.to)}else if(S===w){if(G=r[n+1]||"",G.toLowerCase()===t.c1)return void(N[n]=t.to)}else if(S===k){if(N[n+1]===t.c1||N[n+2]===t.c1)return void(N[n]=t.to)}else if(S===P){if(N[n-2]===t.c1&&N[n-1]===t.c2)return void(N[n]=t.to)}else if(S===M){if(N[n-2]===t.c1&&N[n-1]===t.c2&&N[n+1]===t.c3)return void(N[n]=t.to)}else if(S===R){if(N[n+1]===t.c1&&N[n+2]===t.c2)return void(N[n]=t.to)}else if(S===E){if(G=r[n+1]||"",$=r[n+2]||"",G.toLowerCase()===t.c1||$.toLowerCase()===t.c1)return void(N[n]=t.to)}else if(S===D){if($=r[n-2]||"",$.toLowerCase()===t.c1)return void(N[n]=t.to)}else if(S===x){if(G=r[n-1]||"",$=r[n-2]||"",G.toLowerCase()===t.c1||$.toLowerCase()===t.c1)return void(N[n]=t.to)}else if(S===a&&(G=N[n-1]||"",$=N[n-2]||"",G===t.c1||$===t.c1))return void(N[n]=t.to)}else if(0===n&&e===t.c1)return void(N[n]=t.to)}},applyRules:function(t,e,i,n,s){var r;for(r=0;r<S;r++)N.applyRule($[r],t,n[e],e,i,n,s)},apply:function(t,e,i){for(var n,s=t.length,r=0;r<2;){for(n=0;n<s;n++)i[n]!==!0&&this.applyRules(t[n],n,t,e,r);r++}return e},testSuffixes:function(t){var e;for(e=0;e<I;e++)if(t.match(O[e].regexp))return O[e].pos;return null},getTag:function(e){var i,n,s,a,o,J=r.tag();if(J.norm=e,e.length>1)for(i=null,n=0,s=G.length;n<s;n++)if(0===e.indexOf(G[n]))return J.tag="EM",J.blocked=!0,J.confidence=1,J;return i=t.lexicon[e],i&&"-"!==i?(J.tag=i,J.blocked=i.blocked,J.confidence=1,J):(a=e.toLowerCase(),o=t.synonym(a),o!==a&&(i=t.lexicon[o])?(J.tag=i,J.confidence=1,J):a.match(/(\w)\1+/g)&&(o=j(a))?(J.norm=o,i=t.lexicon[o],J.tag=i,J.confidence=.8,J):"string"==typeof e&&e.match(/[A-Z]/g)&&(i=t.lexicon[a],i&&"-"!==i)?(J.tag=i,J.confidence=.75,J):(i=N.testSuffixes(e),i?(J.tag=i,J.confidence=.25,J):e.indexOf("-")>-1?(e.match(/^[A-Z]/g)?J.tag="NNP":J.tag="JJ",J.confidence/=2,J):J))},tag:function(t){var e,s,r,a,o,J,l,d=[],u=[],c=[],p=t.length,B=!1,g=0,V=function(t,e,i){t="object"==typeof t?t.pos:t,d.push("-"===t?"NN":t),u.push("boolean"==typeof i&&i),g+=e};for(r=0;r<p;r++)e=t[r],c[r]=e,e.match(/^[%\+\-\/@]$/g)?V("SYM",1,!0):e.match(/^(\?|\!|\.){1,}$/g)?V(".",1,!0):e.match(/^-?[0-9]+([\.,][0-9]+)?$/g)||e.match(z)||e.match(/^([0-9]{2}|[0-9]{4})s$/g)||e.match(/^[0-9]{2,4}-[0-9]{2,4}$/g)?V("CD",1,!0):(J=N.getTag(t[r]),V(J.tag,J.confidence,J.blocked),c[r]=J.norm);for(r=0;r<p;r++)if(s=d[r],"SYM"!==s&&"."!==s){if(e=t[r],o=e.toLowerCase(),a=e.length,l=0===r?"":d[r-1],0===r){if("that"===o){d[r]="DT",g++;continue}if(("NN"===s||"VB"===s)&&n.infinitives.indexOf(o)>-1){d[r]="VB",g++;continue}}!(a>3&&e.match(/[^e]ed$/gi)&&0===s.indexOf("N"))||0!==r&&e.match(/^[A-Z][a-z]+/g)?!(a>4&&e.lastIndexOf("ing")===a-3&&n.ing_excpt.indexOf(o)===-1)||0!==s.indexOf("N")&&"MD"!==s||0!==r&&e.match(/^[A-Z][a-z]+/g)||"NN"===l||"JJ"===l||"DT"===l||"VBG"===l?a>4&&o.lastIndexOf("in")===a-2&&"NN"===s&&(0===r||!e.match(/^[A-Z][a-z]+/g))&&"NN"!==l&&"JJ"!==l&&"DT"!==l&&"VBG"!==l&&(J=Z[o+"g"],J&&"VBG"===J.pos)?d[r]="VBG":("TO"===l&&n.infinitives.indexOf(o)>-1&&(s="VB"),"DT"!==l&&e.match(/^[IVXLCDM]+$/g)&&"I"!==e&&(s="CD"),"NN"===s||"VB"===s||"JJ"===s&&n.nationalities.hasOwnProperty(o)===!1?e.match(/^[A-Z]+$/g)||e.match(/^([a-z]{1}\.)+/gi)?(s="NNP",B=!0):r>0&&T(e)?(s="NNP",B=!0,J=t[r-1],1!==r||"NN"!==l&&"NNS"!==l&&"JJ"!==l&&"VB"!==l||!T(J)||(d[r-1]="NNP")):B=!1:B&&("CD"===s&&e.match(/^[IVXLCDM]+$/g)||"I"===e)?s="NNP":B="NNP"===s||"NNPS"===s,"NN"===s&&i(e)&&(s="NNS"),d[r]=s):d[r]="VBG":d[r]="VBN"}for(N.apply(t,d,u),r=0;r<p;r++)e=t[r],s=d[r],l=d[r-1]||"",e.match(/ed$/g)&&("JJ"!==s||"VBZ"!==l&&"VBP"!==l||"TO"!==d[r+1]||(s="VBN")),d[r]=s;return{tags:d,norms:c,confidence:g/p}}}),t.tag=N.tag}(),!function(){var e=["#","SYM","CR","EM"];t.stat=function(t){var i,n,s,r,a=t.length,o=a,J=t.stats,l=0,d=0,N=0,u=0,c=0;for(i=0;i<a;i++)n=t.tokens[i],s=n.raw,l+=s.length,r=t.tags[i],n.attr.is_punc||e.indexOf(r)>-1?o--:(u+=1,s.match(/^[A-Z][a-zA-Z]+$/g)&&c++,s.match(/[A-Z]+/)&&!s.match(/[a-z]/)&&N++,"FW"===r&&d++);0===o&&(o=1),J.words=u,J.p_foreign=100*d/o,J.p_upper=100*N/o,J.p_cap=100*c/o,J.avg_length=l/o}}(),!function(){var e=n.synonyms,i=e.length;t.synonym=function(t){var n;for(n=0;n<i;n++)if(e[n].indexOf(t)>0)return e[n][0];return t}}()}("undefined"==typeof exports?this.compendium={}:exports);
},{}],28:[function(require,module,exports){
// HumanizeDuration.js - http://git.io/j0HgmQ

;(function () {
  var languages = {
    ar: {
      y: function (c) { return c === 1 ? 'سنة' : 'سنوات' },
      mo: function (c) { return c === 1 ? 'شهر' : 'أشهر' },
      w: function (c) { return c === 1 ? 'أسبوع' : 'أسابيع' },
      d: function (c) { return c === 1 ? 'يوم' : 'أيام' },
      h: function (c) { return c === 1 ? 'ساعة' : 'ساعات' },
      m: function (c) { return c === 1 ? 'دقيقة' : 'دقائق' },
      s: function (c) { return c === 1 ? 'ثانية' : 'ثواني' },
      ms: function (c) { return c === 1 ? 'جزء من الثانية' : 'أجزاء من الثانية' },
      decimal: ','
    },
    bg: {
      y: function (c) { return ['години', 'година', 'години'][getSlavicForm(c)] },
      mo: function (c) { return ['месеца', 'месец', 'месеца'][getSlavicForm(c)] },
      w: function (c) { return ['седмици', 'седмица', 'седмици'][getSlavicForm(c)] },
      d: function (c) { return ['дни', 'ден', 'дни'][getSlavicForm(c)] },
      h: function (c) { return ['часа', 'час', 'часа'][getSlavicForm(c)] },
      m: function (c) { return ['минути', 'минута', 'минути'][getSlavicForm(c)] },
      s: function (c) { return ['секунди', 'секунда', 'секунди'][getSlavicForm(c)] },
      ms: function (c) { return ['милисекунди', 'милисекунда', 'милисекунди'][getSlavicForm(c)] },
      decimal: ','
    },
    ca: {
      y: function (c) { return 'any' + (c === 1 ? '' : 's') },
      mo: function (c) { return 'mes' + (c === 1 ? '' : 'os') },
      w: function (c) { return 'setman' + (c === 1 ? 'a' : 'es') },
      d: function (c) { return 'di' + (c === 1 ? 'a' : 'es') },
      h: function (c) { return 'hor' + (c === 1 ? 'a' : 'es') },
      m: function (c) { return 'minut' + (c === 1 ? '' : 's') },
      s: function (c) { return 'segon' + (c === 1 ? '' : 's') },
      ms: function (c) { return 'milisegon' + (c === 1 ? '' : 's') },
      decimal: ','
    },
    cs: {
      y: function (c) { return ['rok', 'roku', 'roky', 'let'][getCzechOrSlovakForm(c)] },
      mo: function (c) { return ['měsíc', 'měsíce', 'měsíce', 'měsíců'][getCzechOrSlovakForm(c)] },
      w: function (c) { return ['týden', 'týdne', 'týdny', 'týdnů'][getCzechOrSlovakForm(c)] },
      d: function (c) { return ['den', 'dne', 'dny', 'dní'][getCzechOrSlovakForm(c)] },
      h: function (c) { return ['hodina', 'hodiny', 'hodiny', 'hodin'][getCzechOrSlovakForm(c)] },
      m: function (c) { return ['minuta', 'minuty', 'minuty', 'minut'][getCzechOrSlovakForm(c)] },
      s: function (c) { return ['sekunda', 'sekundy', 'sekundy', 'sekund'][getCzechOrSlovakForm(c)] },
      ms: function (c) { return ['milisekunda', 'milisekundy', 'milisekundy', 'milisekund'][getCzechOrSlovakForm(c)] },
      decimal: ','
    },
    da: {
      y: 'år',
      mo: function (c) { return 'måned' + (c === 1 ? '' : 'er') },
      w: function (c) { return 'uge' + (c === 1 ? '' : 'r') },
      d: function (c) { return 'dag' + (c === 1 ? '' : 'e') },
      h: function (c) { return 'time' + (c === 1 ? '' : 'r') },
      m: function (c) { return 'minut' + (c === 1 ? '' : 'ter') },
      s: function (c) { return 'sekund' + (c === 1 ? '' : 'er') },
      ms: function (c) { return 'millisekund' + (c === 1 ? '' : 'er') },
      decimal: ','
    },
    de: {
      y: function (c) { return 'Jahr' + (c === 1 ? '' : 'e') },
      mo: function (c) { return 'Monat' + (c === 1 ? '' : 'e') },
      w: function (c) { return 'Woche' + (c === 1 ? '' : 'n') },
      d: function (c) { return 'Tag' + (c === 1 ? '' : 'e') },
      h: function (c) { return 'Stunde' + (c === 1 ? '' : 'n') },
      m: function (c) { return 'Minute' + (c === 1 ? '' : 'n') },
      s: function (c) { return 'Sekunde' + (c === 1 ? '' : 'n') },
      ms: function (c) { return 'Millisekunde' + (c === 1 ? '' : 'n') },
      decimal: ','
    },
    en: {
      y: function (c) { return 'year' + (c === 1 ? '' : 's') },
      mo: function (c) { return 'month' + (c === 1 ? '' : 's') },
      w: function (c) { return 'week' + (c === 1 ? '' : 's') },
      d: function (c) { return 'day' + (c === 1 ? '' : 's') },
      h: function (c) { return 'hour' + (c === 1 ? '' : 's') },
      m: function (c) { return 'minute' + (c === 1 ? '' : 's') },
      s: function (c) { return 'second' + (c === 1 ? '' : 's') },
      ms: function (c) { return 'millisecond' + (c === 1 ? '' : 's') },
      decimal: '.'
    },
    es: {
      y: function (c) { return 'año' + (c === 1 ? '' : 's') },
      mo: function (c) { return 'mes' + (c === 1 ? '' : 'es') },
      w: function (c) { return 'semana' + (c === 1 ? '' : 's') },
      d: function (c) { return 'día' + (c === 1 ? '' : 's') },
      h: function (c) { return 'hora' + (c === 1 ? '' : 's') },
      m: function (c) { return 'minuto' + (c === 1 ? '' : 's') },
      s: function (c) { return 'segundo' + (c === 1 ? '' : 's') },
      ms: function (c) { return 'milisegundo' + (c === 1 ? '' : 's') },
      decimal: ','
    },
    fa: {
      y: 'سال',
      mo: 'ماه',
      w: 'هفته',
      d: 'روز',
      h: 'ساعت',
      m: 'دقیقه',
      s: 'ثانیه',
      ms: 'میلی ثانیه',
      decimal: '.'
    },
    fi: {
      y: function (c) { return c === 1 ? 'vuosi' : 'vuotta' },
      mo: function (c) { return c === 1 ? 'kuukausi' : 'kuukautta' },
      w: function (c) { return 'viikko' + (c === 1 ? '' : 'a') },
      d: function (c) { return 'päivä' + (c === 1 ? '' : 'ä') },
      h: function (c) { return 'tunti' + (c === 1 ? '' : 'a') },
      m: function (c) { return 'minuutti' + (c === 1 ? '' : 'a') },
      s: function (c) { return 'sekunti' + (c === 1 ? '' : 'a') },
      ms: function (c) { return 'millisekunti' + (c === 1 ? '' : 'a') },
      decimal: ','
    },
    fr: {
      y: function (c) { return 'an' + (c >= 2 ? 's' : '') },
      mo: 'mois',
      w: function (c) { return 'semaine' + (c >= 2 ? 's' : '') },
      d: function (c) { return 'jour' + (c >= 2 ? 's' : '') },
      h: function (c) { return 'heure' + (c >= 2 ? 's' : '') },
      m: function (c) { return 'minute' + (c >= 2 ? 's' : '') },
      s: function (c) { return 'seconde' + (c >= 2 ? 's' : '') },
      ms: function (c) { return 'milliseconde' + (c >= 2 ? 's' : '') },
      decimal: ','
    },
    gr: {
      y: function (c) { return c === 1 ? 'χρόνος' : 'χρόνια' },
      mo: function (c) { return c === 1 ? 'μήνας' : 'μήνες' },
      w: function (c) { return c === 1 ? 'εβδομάδα' : 'εβδομάδες' },
      d: function (c) { return c === 1 ? 'μέρα' : 'μέρες' },
      h: function (c) { return c === 1 ? 'ώρα' : 'ώρες' },
      m: function (c) { return c === 1 ? 'λεπτό' : 'λεπτά' },
      s: function (c) { return c === 1 ? 'δευτερόλεπτο' : 'δευτερόλεπτα' },
      ms: function (c) { return c === 1 ? 'χιλιοστό του δευτερολέπτου' : 'χιλιοστά του δευτερολέπτου' },
      decimal: ','
    },
    hu: {
      y: 'év',
      mo: 'hónap',
      w: 'hét',
      d: 'nap',
      h: 'óra',
      m: 'perc',
      s: 'másodperc',
      ms: 'ezredmásodperc',
      decimal: ','
    },
    id: {
      y: 'tahun',
      mo: 'bulan',
      w: 'minggu',
      d: 'hari',
      h: 'jam',
      m: 'menit',
      s: 'detik',
      ms: 'milidetik',
      decimal: '.'
    },
    is: {
      y: 'ár',
      mo: function (c) { return 'mánuð' + (c === 1 ? 'ur' : 'ir') },
      w: function (c) { return 'vik' + (c === 1 ? 'a' : 'ur') },
      d: function (c) { return 'dag' + (c === 1 ? 'ur' : 'ar') },
      h: function (c) { return 'klukkutím' + (c === 1 ? 'i' : 'ar') },
      m: function (c) { return 'mínút' + (c === 1 ? 'a' : 'ur') },
      s: function (c) { return 'sekúnd' + (c === 1 ? 'a' : 'ur') },
      ms: function (c) { return 'millisekúnd' + (c === 1 ? 'a' : 'ur') },
      decimal: '.'
    },
    it: {
      y: function (c) { return 'ann' + (c === 1 ? 'o' : 'i') },
      mo: function (c) { return 'mes' + (c === 1 ? 'e' : 'i') },
      w: function (c) { return 'settiman' + (c === 1 ? 'a' : 'e') },
      d: function (c) { return 'giorn' + (c === 1 ? 'o' : 'i') },
      h: function (c) { return 'or' + (c === 1 ? 'a' : 'e') },
      m: function (c) { return 'minut' + (c === 1 ? 'o' : 'i') },
      s: function (c) { return 'second' + (c === 1 ? 'o' : 'i') },
      ms: function (c) { return 'millisecond' + (c === 1 ? 'o' : 'i') },
      decimal: ','
    },
    ja: {
      y: '年',
      mo: '月',
      w: '週',
      d: '日',
      h: '時間',
      m: '分',
      s: '秒',
      ms: 'ミリ秒',
      decimal: '.'
    },
    ko: {
      y: '년',
      mo: '개월',
      w: '주일',
      d: '일',
      h: '시간',
      m: '분',
      s: '초',
      ms: '밀리 초',
      decimal: '.'
    },
    lt: {
      y: function (c) { return ((c % 10 === 0) || (c % 100 >= 10 && c % 100 <= 20)) ? 'metų' : 'metai' },
      mo: function (c) { return ['mėnuo', 'mėnesiai', 'mėnesių'][getLithuanianForm(c)] },
      w: function (c) { return ['savaitė', 'savaitės', 'savaičių'][getLithuanianForm(c)] },
      d: function (c) { return ['diena', 'dienos', 'dienų'][getLithuanianForm(c)] },
      h: function (c) { return ['valanda', 'valandos', 'valandų'][getLithuanianForm(c)] },
      m: function (c) { return ['minutė', 'minutės', 'minučių'][getLithuanianForm(c)] },
      s: function (c) { return ['sekundė', 'sekundės', 'sekundžių'][getLithuanianForm(c)] },
      ms: function (c) { return ['milisekundė', 'milisekundės', 'milisekundžių'][getLithuanianForm(c)] },
      decimal: ','
    },
    ms: {
      y: 'tahun',
      mo: 'bulan',
      w: 'minggu',
      d: 'hari',
      h: 'jam',
      m: 'minit',
      s: 'saat',
      ms: 'milisaat',
      decimal: '.'
    },
    nl: {
      y: 'jaar',
      mo: function (c) { return c === 1 ? 'maand' : 'maanden' },
      w: function (c) { return c === 1 ? 'week' : 'weken' },
      d: function (c) { return c === 1 ? 'dag' : 'dagen' },
      h: 'uur',
      m: function (c) { return c === 1 ? 'minuut' : 'minuten' },
      s: function (c) { return c === 1 ? 'seconde' : 'seconden' },
      ms: function (c) { return c === 1 ? 'milliseconde' : 'milliseconden' },
      decimal: ','
    },
    no: {
      y: 'år',
      mo: function (c) { return 'måned' + (c === 1 ? '' : 'er') },
      w: function (c) { return 'uke' + (c === 1 ? '' : 'r') },
      d: function (c) { return 'dag' + (c === 1 ? '' : 'er') },
      h: function (c) { return 'time' + (c === 1 ? '' : 'r') },
      m: function (c) { return 'minutt' + (c === 1 ? '' : 'er') },
      s: function (c) { return 'sekund' + (c === 1 ? '' : 'er') },
      ms: function (c) { return 'millisekund' + (c === 1 ? '' : 'er') },
      decimal: ','
    },
    pl: {
      y: function (c) { return ['rok', 'roku', 'lata', 'lat'][getPolishForm(c)] },
      mo: function (c) { return ['miesiąc', 'miesiąca', 'miesiące', 'miesięcy'][getPolishForm(c)] },
      w: function (c) { return ['tydzień', 'tygodnia', 'tygodnie', 'tygodni'][getPolishForm(c)] },
      d: function (c) { return ['dzień', 'dnia', 'dni', 'dni'][getPolishForm(c)] },
      h: function (c) { return ['godzina', 'godziny', 'godziny', 'godzin'][getPolishForm(c)] },
      m: function (c) { return ['minuta', 'minuty', 'minuty', 'minut'][getPolishForm(c)] },
      s: function (c) { return ['sekunda', 'sekundy', 'sekundy', 'sekund'][getPolishForm(c)] },
      ms: function (c) { return ['milisekunda', 'milisekundy', 'milisekundy', 'milisekund'][getPolishForm(c)] },
      decimal: ','
    },
    pt: {
      y: function (c) { return 'ano' + (c === 1 ? '' : 's') },
      mo: function (c) { return c === 1 ? 'mês' : 'meses' },
      w: function (c) { return 'semana' + (c === 1 ? '' : 's') },
      d: function (c) { return 'dia' + (c === 1 ? '' : 's') },
      h: function (c) { return 'hora' + (c === 1 ? '' : 's') },
      m: function (c) { return 'minuto' + (c === 1 ? '' : 's') },
      s: function (c) { return 'segundo' + (c === 1 ? '' : 's') },
      ms: function (c) { return 'milissegundo' + (c === 1 ? '' : 's') },
      decimal: ','
    },
    ru: {
      y: function (c) { return ['лет', 'год', 'года'][getSlavicForm(c)] },
      mo: function (c) { return ['месяцев', 'месяц', 'месяца'][getSlavicForm(c)] },
      w: function (c) { return ['недель', 'неделя', 'недели'][getSlavicForm(c)] },
      d: function (c) { return ['дней', 'день', 'дня'][getSlavicForm(c)] },
      h: function (c) { return ['часов', 'час', 'часа'][getSlavicForm(c)] },
      m: function (c) { return ['минут', 'минута', 'минуты'][getSlavicForm(c)] },
      s: function (c) { return ['секунд', 'секунда', 'секунды'][getSlavicForm(c)] },
      ms: function (c) { return ['миллисекунд', 'миллисекунда', 'миллисекунды'][getSlavicForm(c)] },
      decimal: ','
    },
    uk: {
      y: function (c) { return ['років', 'рік', 'роки'][getSlavicForm(c)] },
      mo: function (c) { return ['місяців', 'місяць', 'місяці'][getSlavicForm(c)] },
      w: function (c) { return ['тижнів', 'тиждень', 'тижні'][getSlavicForm(c)] },
      d: function (c) { return ['днів', 'день', 'дні'][getSlavicForm(c)] },
      h: function (c) { return ['годин', 'година', 'години'][getSlavicForm(c)] },
      m: function (c) { return ['хвилин', 'хвилина', 'хвилини'][getSlavicForm(c)] },
      s: function (c) { return ['секунд', 'секунда', 'секунди'][getSlavicForm(c)] },
      ms: function (c) { return ['мілісекунд', 'мілісекунда', 'мілісекунди'][getSlavicForm(c)] },
      decimal: ','
    },
    ur: {
      y: 'سال',
      mo: function (c) { return c === 1 ? 'مہینہ' : 'مہینے' },
      w: function (c) { return c === 1 ? 'ہفتہ' : 'ہفتے' },
      d: 'دن',
      h: function (c) { return c === 1 ? 'گھنٹہ' : 'گھنٹے' },
      m: 'منٹ',
      s: 'سیکنڈ',
      ms: 'ملی سیکنڈ',
      decimal: '.'
    },
    sk: {
      y: function (c) { return ['rok', 'roky', 'roky', 'rokov'][getCzechOrSlovakForm(c)] },
      mo: function (c) { return ['mesiac', 'mesiace', 'mesiace', 'mesiacov'][getCzechOrSlovakForm(c)] },
      w: function (c) { return ['týždeň', 'týždne', 'týždne', 'týždňov'][getCzechOrSlovakForm(c)] },
      d: function (c) { return ['deň', 'dni', 'dni', 'dní'][getCzechOrSlovakForm(c)] },
      h: function (c) { return ['hodina', 'hodiny', 'hodiny', 'hodín'][getCzechOrSlovakForm(c)] },
      m: function (c) { return ['minúta', 'minúty', 'minúty', 'minút'][getCzechOrSlovakForm(c)] },
      s: function (c) { return ['sekunda', 'sekundy', 'sekundy', 'sekúnd'][getCzechOrSlovakForm(c)] },
      ms: function (c) { return ['milisekunda', 'milisekundy', 'milisekundy', 'milisekúnd'][getCzechOrSlovakForm(c)] },
      decimal: ','
    },
    sv: {
      y: 'år',
      mo: function (c) { return 'månad' + (c === 1 ? '' : 'er') },
      w: function (c) { return 'veck' + (c === 1 ? 'a' : 'or') },
      d: function (c) { return 'dag' + (c === 1 ? '' : 'ar') },
      h: function (c) { return 'timm' + (c === 1 ? 'e' : 'ar') },
      m: function (c) { return 'minut' + (c === 1 ? '' : 'er') },
      s: function (c) { return 'sekund' + (c === 1 ? '' : 'er') },
      ms: function (c) { return 'millisekund' + (c === 1 ? '' : 'er') },
      decimal: ','
    },
    tr: {
      y: 'yıl',
      mo: 'ay',
      w: 'hafta',
      d: 'gün',
      h: 'saat',
      m: 'dakika',
      s: 'saniye',
      ms: 'milisaniye',
      decimal: ','
    },
    vi: {
      y: 'năm',
      mo: 'tháng',
      w: 'tuần',
      d: 'ngày',
      h: 'giờ',
      m: 'phút',
      s: 'giây',
      ms: 'mili giây',
      decimal: ','
    },
    zh_CN: {
      y: '年',
      mo: '个月',
      w: '周',
      d: '天',
      h: '小时',
      m: '分钟',
      s: '秒',
      ms: '毫秒',
      decimal: '.'
    },
    zh_TW: {
      y: '年',
      mo: '個月',
      w: '周',
      d: '天',
      h: '小時',
      m: '分鐘',
      s: '秒',
      ms: '毫秒',
      decimal: '.'
    }
  }

  // You can create a humanizer, which returns a function with default
  // parameters.
  function humanizer (passedOptions) {
    var result = function humanizer (ms, humanizerOptions) {
      var options = extend({}, result, humanizerOptions || {})
      return doHumanization(ms, options)
    }

    return extend(result, {
      language: 'en',
      delimiter: ', ',
      spacer: ' ',
      conjunction: '',
      serialComma: true,
      units: ['y', 'mo', 'w', 'd', 'h', 'm', 's'],
      languages: {},
      round: false,
      unitMeasures: {
        y: 31557600000,
        mo: 2629800000,
        w: 604800000,
        d: 86400000,
        h: 3600000,
        m: 60000,
        s: 1000,
        ms: 1
      }
    }, passedOptions)
  }

  // The main function is just a wrapper around a default humanizer.
  var humanizeDuration = humanizer({})

  // doHumanization does the bulk of the work.
  function doHumanization (ms, options) {
    var i, len, piece

    // Make sure we have a positive number.
    // Has the nice sideffect of turning Number objects into primitives.
    ms = Math.abs(ms)

    var dictionary = options.languages[options.language] || languages[options.language]
    if (!dictionary) {
      throw new Error('No language ' + dictionary + '.')
    }

    var pieces = []

    // Start at the top and keep removing units, bit by bit.
    var unitName, unitMS, unitCount
    for (i = 0, len = options.units.length; i < len; i++) {
      unitName = options.units[i]
      unitMS = options.unitMeasures[unitName]

      // What's the number of full units we can fit?
      if (i + 1 === len) {
        unitCount = ms / unitMS
      } else {
        unitCount = Math.floor(ms / unitMS)
      }

      // Add the string.
      pieces.push({
        unitCount: unitCount,
        unitName: unitName
      })

      // Remove what we just figured out.
      ms -= unitCount * unitMS
    }

    var firstOccupiedUnitIndex = 0
    for (i = 0; i < pieces.length; i++) {
      if (pieces[i].unitCount) {
        firstOccupiedUnitIndex = i
        break
      }
    }

    if (options.round) {
      var ratioToLargerUnit, previousPiece
      for (i = pieces.length - 1; i >= 0; i--) {
        piece = pieces[i]
        piece.unitCount = Math.round(piece.unitCount)

        if (i === 0) { break }

        previousPiece = pieces[i - 1]

        ratioToLargerUnit = options.unitMeasures[previousPiece.unitName] / options.unitMeasures[piece.unitName]
        if ((piece.unitCount % ratioToLargerUnit) === 0 || (options.largest && ((options.largest - 1) < (i - firstOccupiedUnitIndex)))) {
          previousPiece.unitCount += piece.unitCount / ratioToLargerUnit
          piece.unitCount = 0
        }
      }
    }

    var result = []
    for (i = 0, pieces.length; i < len; i++) {
      piece = pieces[i]
      if (piece.unitCount) {
        result.push(render(piece.unitCount, piece.unitName, dictionary, options))
      }

      if (result.length === options.largest) { break }
    }

    if (result.length) {
      if (!options.conjunction || result.length === 1) {
        return result.join(options.delimiter)
      } else if (result.length === 2) {
        return result.join(options.conjunction)
      } else if (result.length > 2) {
        return result.slice(0, -1).join(options.delimiter) + (options.serialComma ? ',' : '') + options.conjunction + result.slice(-1)
      }
    } else {
      return render(0, options.units[options.units.length - 1], dictionary, options)
    }
  }

  function render (count, type, dictionary, options) {
    var decimal
    if (options.decimal === void 0) {
      decimal = dictionary.decimal
    } else {
      decimal = options.decimal
    }

    var countStr = count.toString().replace('.', decimal)

    var dictionaryValue = dictionary[type]
    var word
    if (typeof dictionaryValue === 'function') {
      word = dictionaryValue(count)
    } else {
      word = dictionaryValue
    }

    return countStr + options.spacer + word
  }

  function extend (destination) {
    var source
    for (var i = 1; i < arguments.length; i++) {
      source = arguments[i]
      for (var prop in source) {
        if (source.hasOwnProperty(prop)) {
          destination[prop] = source[prop]
        }
      }
    }
    return destination
  }

  // Internal helper function for Polish language.
  function getPolishForm (c) {
    if (c === 1) {
      return 0
    } else if (Math.floor(c) !== c) {
      return 1
    } else if (c % 10 >= 2 && c % 10 <= 4 && !(c % 100 > 10 && c % 100 < 20)) {
      return 2
    } else {
      return 3
    }
  }

  // Internal helper function for Russian and Ukranian languages.
  function getSlavicForm (c) {
    if (Math.floor(c) !== c) {
      return 2
    } else if ((c % 100 >= 5 && c % 100 <= 20) || (c % 10 >= 5 && c % 10 <= 9) || c % 10 === 0) {
      return 0
    } else if (c % 10 === 1) {
      return 1
    } else if (c > 1) {
      return 2
    } else {
      return 0
    }
  }

    // Internal helper function for Slovak language.
  function getCzechOrSlovakForm (c) {
    if (c === 1) {
      return 0
    } else if (Math.floor(c) !== c) {
      return 1
    } else if (c % 10 >= 2 && c % 10 <= 4 && c % 100 < 10) {
      return 2
    } else {
      return 3
    }
  }

  // Internal helper function for Lithuanian language.
  function getLithuanianForm (c) {
    if (c === 1 || (c % 10 === 1 && c % 100 > 20)) {
      return 0
    } else if (Math.floor(c) !== c || (c % 10 >= 2 && c % 100 > 20) || (c % 10 >= 2 && c % 100 < 10)) {
      return 1
    } else {
      return 2
    }
  }

  humanizeDuration.getSupportedLanguages = function getSupportedLanguages () {
    var result = []
    for (var language in languages) {
      if (languages.hasOwnProperty(language)) {
        result.push(language)
      }
    }
    return result
  }

  humanizeDuration.humanizer = humanizer

  if (typeof define === 'function' && define.amd) {
    define(function () {
      return humanizeDuration
    })
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = humanizeDuration
  } else {
    this.humanizeDuration = humanizeDuration
  }
})();  // eslint-disable-line semi

},{}],29:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}],30:[function(require,module,exports){
//! moment.js
//! version : 2.11.2
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

;(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    global.moment = factory()
}(this, function () { 'use strict';

    var hookCallback;

    function utils_hooks__hooks () {
        return hookCallback.apply(null, arguments);
    }

    // This is done to register the method called with moment()
    // without creating circular dependencies.
    function setHookCallback (callback) {
        hookCallback = callback;
    }

    function isArray(input) {
        return Object.prototype.toString.call(input) === '[object Array]';
    }

    function isDate(input) {
        return input instanceof Date || Object.prototype.toString.call(input) === '[object Date]';
    }

    function map(arr, fn) {
        var res = [], i;
        for (i = 0; i < arr.length; ++i) {
            res.push(fn(arr[i], i));
        }
        return res;
    }

    function hasOwnProp(a, b) {
        return Object.prototype.hasOwnProperty.call(a, b);
    }

    function extend(a, b) {
        for (var i in b) {
            if (hasOwnProp(b, i)) {
                a[i] = b[i];
            }
        }

        if (hasOwnProp(b, 'toString')) {
            a.toString = b.toString;
        }

        if (hasOwnProp(b, 'valueOf')) {
            a.valueOf = b.valueOf;
        }

        return a;
    }

    function create_utc__createUTC (input, format, locale, strict) {
        return createLocalOrUTC(input, format, locale, strict, true).utc();
    }

    function defaultParsingFlags() {
        // We need to deep clone this object.
        return {
            empty           : false,
            unusedTokens    : [],
            unusedInput     : [],
            overflow        : -2,
            charsLeftOver   : 0,
            nullInput       : false,
            invalidMonth    : null,
            invalidFormat   : false,
            userInvalidated : false,
            iso             : false
        };
    }

    function getParsingFlags(m) {
        if (m._pf == null) {
            m._pf = defaultParsingFlags();
        }
        return m._pf;
    }

    function valid__isValid(m) {
        if (m._isValid == null) {
            var flags = getParsingFlags(m);
            m._isValid = !isNaN(m._d.getTime()) &&
                flags.overflow < 0 &&
                !flags.empty &&
                !flags.invalidMonth &&
                !flags.invalidWeekday &&
                !flags.nullInput &&
                !flags.invalidFormat &&
                !flags.userInvalidated;

            if (m._strict) {
                m._isValid = m._isValid &&
                    flags.charsLeftOver === 0 &&
                    flags.unusedTokens.length === 0 &&
                    flags.bigHour === undefined;
            }
        }
        return m._isValid;
    }

    function valid__createInvalid (flags) {
        var m = create_utc__createUTC(NaN);
        if (flags != null) {
            extend(getParsingFlags(m), flags);
        }
        else {
            getParsingFlags(m).userInvalidated = true;
        }

        return m;
    }

    function isUndefined(input) {
        return input === void 0;
    }

    // Plugins that add properties should also add the key here (null value),
    // so we can properly clone ourselves.
    var momentProperties = utils_hooks__hooks.momentProperties = [];

    function copyConfig(to, from) {
        var i, prop, val;

        if (!isUndefined(from._isAMomentObject)) {
            to._isAMomentObject = from._isAMomentObject;
        }
        if (!isUndefined(from._i)) {
            to._i = from._i;
        }
        if (!isUndefined(from._f)) {
            to._f = from._f;
        }
        if (!isUndefined(from._l)) {
            to._l = from._l;
        }
        if (!isUndefined(from._strict)) {
            to._strict = from._strict;
        }
        if (!isUndefined(from._tzm)) {
            to._tzm = from._tzm;
        }
        if (!isUndefined(from._isUTC)) {
            to._isUTC = from._isUTC;
        }
        if (!isUndefined(from._offset)) {
            to._offset = from._offset;
        }
        if (!isUndefined(from._pf)) {
            to._pf = getParsingFlags(from);
        }
        if (!isUndefined(from._locale)) {
            to._locale = from._locale;
        }

        if (momentProperties.length > 0) {
            for (i in momentProperties) {
                prop = momentProperties[i];
                val = from[prop];
                if (!isUndefined(val)) {
                    to[prop] = val;
                }
            }
        }

        return to;
    }

    var updateInProgress = false;

    // Moment prototype object
    function Moment(config) {
        copyConfig(this, config);
        this._d = new Date(config._d != null ? config._d.getTime() : NaN);
        // Prevent infinite loop in case updateOffset creates new moment
        // objects.
        if (updateInProgress === false) {
            updateInProgress = true;
            utils_hooks__hooks.updateOffset(this);
            updateInProgress = false;
        }
    }

    function isMoment (obj) {
        return obj instanceof Moment || (obj != null && obj._isAMomentObject != null);
    }

    function absFloor (number) {
        if (number < 0) {
            return Math.ceil(number);
        } else {
            return Math.floor(number);
        }
    }

    function toInt(argumentForCoercion) {
        var coercedNumber = +argumentForCoercion,
            value = 0;

        if (coercedNumber !== 0 && isFinite(coercedNumber)) {
            value = absFloor(coercedNumber);
        }

        return value;
    }

    // compare two arrays, return the number of differences
    function compareArrays(array1, array2, dontConvert) {
        var len = Math.min(array1.length, array2.length),
            lengthDiff = Math.abs(array1.length - array2.length),
            diffs = 0,
            i;
        for (i = 0; i < len; i++) {
            if ((dontConvert && array1[i] !== array2[i]) ||
                (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
                diffs++;
            }
        }
        return diffs + lengthDiff;
    }

    function Locale() {
    }

    // internal storage for locale config files
    var locales = {};
    var globalLocale;

    function normalizeLocale(key) {
        return key ? key.toLowerCase().replace('_', '-') : key;
    }

    // pick the locale from the array
    // try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
    // substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
    function chooseLocale(names) {
        var i = 0, j, next, locale, split;

        while (i < names.length) {
            split = normalizeLocale(names[i]).split('-');
            j = split.length;
            next = normalizeLocale(names[i + 1]);
            next = next ? next.split('-') : null;
            while (j > 0) {
                locale = loadLocale(split.slice(0, j).join('-'));
                if (locale) {
                    return locale;
                }
                if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
                    //the next array item is better than a shallower substring of this one
                    break;
                }
                j--;
            }
            i++;
        }
        return null;
    }

    function loadLocale(name) {
        var oldLocale = null;
        // TODO: Find a better way to register and load all the locales in Node
        if (!locales[name] && (typeof module !== 'undefined') &&
                module && module.exports) {
            try {
                oldLocale = globalLocale._abbr;
                require('./locale/' + name);
                // because defineLocale currently also sets the global locale, we
                // want to undo that for lazy loaded locales
                locale_locales__getSetGlobalLocale(oldLocale);
            } catch (e) { }
        }
        return locales[name];
    }

    // This function will load locale and then set the global locale.  If
    // no arguments are passed in, it will simply return the current global
    // locale key.
    function locale_locales__getSetGlobalLocale (key, values) {
        var data;
        if (key) {
            if (isUndefined(values)) {
                data = locale_locales__getLocale(key);
            }
            else {
                data = defineLocale(key, values);
            }

            if (data) {
                // moment.duration._locale = moment._locale = data;
                globalLocale = data;
            }
        }

        return globalLocale._abbr;
    }

    function defineLocale (name, values) {
        if (values !== null) {
            values.abbr = name;
            locales[name] = locales[name] || new Locale();
            locales[name].set(values);

            // backwards compat for now: also set the locale
            locale_locales__getSetGlobalLocale(name);

            return locales[name];
        } else {
            // useful for testing
            delete locales[name];
            return null;
        }
    }

    // returns locale data
    function locale_locales__getLocale (key) {
        var locale;

        if (key && key._locale && key._locale._abbr) {
            key = key._locale._abbr;
        }

        if (!key) {
            return globalLocale;
        }

        if (!isArray(key)) {
            //short-circuit everything else
            locale = loadLocale(key);
            if (locale) {
                return locale;
            }
            key = [key];
        }

        return chooseLocale(key);
    }

    var aliases = {};

    function addUnitAlias (unit, shorthand) {
        var lowerCase = unit.toLowerCase();
        aliases[lowerCase] = aliases[lowerCase + 's'] = aliases[shorthand] = unit;
    }

    function normalizeUnits(units) {
        return typeof units === 'string' ? aliases[units] || aliases[units.toLowerCase()] : undefined;
    }

    function normalizeObjectUnits(inputObject) {
        var normalizedInput = {},
            normalizedProp,
            prop;

        for (prop in inputObject) {
            if (hasOwnProp(inputObject, prop)) {
                normalizedProp = normalizeUnits(prop);
                if (normalizedProp) {
                    normalizedInput[normalizedProp] = inputObject[prop];
                }
            }
        }

        return normalizedInput;
    }

    function isFunction(input) {
        return input instanceof Function || Object.prototype.toString.call(input) === '[object Function]';
    }

    function makeGetSet (unit, keepTime) {
        return function (value) {
            if (value != null) {
                get_set__set(this, unit, value);
                utils_hooks__hooks.updateOffset(this, keepTime);
                return this;
            } else {
                return get_set__get(this, unit);
            }
        };
    }

    function get_set__get (mom, unit) {
        return mom.isValid() ?
            mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]() : NaN;
    }

    function get_set__set (mom, unit, value) {
        if (mom.isValid()) {
            mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
        }
    }

    // MOMENTS

    function getSet (units, value) {
        var unit;
        if (typeof units === 'object') {
            for (unit in units) {
                this.set(unit, units[unit]);
            }
        } else {
            units = normalizeUnits(units);
            if (isFunction(this[units])) {
                return this[units](value);
            }
        }
        return this;
    }

    function zeroFill(number, targetLength, forceSign) {
        var absNumber = '' + Math.abs(number),
            zerosToFill = targetLength - absNumber.length,
            sign = number >= 0;
        return (sign ? (forceSign ? '+' : '') : '-') +
            Math.pow(10, Math.max(0, zerosToFill)).toString().substr(1) + absNumber;
    }

    var formattingTokens = /(\[[^\[]*\])|(\\)?([Hh]mm(ss)?|Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Qo?|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|S{1,9}|x|X|zz?|ZZ?|.)/g;

    var localFormattingTokens = /(\[[^\[]*\])|(\\)?(LTS|LT|LL?L?L?|l{1,4})/g;

    var formatFunctions = {};

    var formatTokenFunctions = {};

    // token:    'M'
    // padded:   ['MM', 2]
    // ordinal:  'Mo'
    // callback: function () { this.month() + 1 }
    function addFormatToken (token, padded, ordinal, callback) {
        var func = callback;
        if (typeof callback === 'string') {
            func = function () {
                return this[callback]();
            };
        }
        if (token) {
            formatTokenFunctions[token] = func;
        }
        if (padded) {
            formatTokenFunctions[padded[0]] = function () {
                return zeroFill(func.apply(this, arguments), padded[1], padded[2]);
            };
        }
        if (ordinal) {
            formatTokenFunctions[ordinal] = function () {
                return this.localeData().ordinal(func.apply(this, arguments), token);
            };
        }
    }

    function removeFormattingTokens(input) {
        if (input.match(/\[[\s\S]/)) {
            return input.replace(/^\[|\]$/g, '');
        }
        return input.replace(/\\/g, '');
    }

    function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
            if (formatTokenFunctions[array[i]]) {
                array[i] = formatTokenFunctions[array[i]];
            } else {
                array[i] = removeFormattingTokens(array[i]);
            }
        }

        return function (mom) {
            var output = '';
            for (i = 0; i < length; i++) {
                output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
            }
            return output;
        };
    }

    // format date using native date object
    function formatMoment(m, format) {
        if (!m.isValid()) {
            return m.localeData().invalidDate();
        }

        format = expandFormat(format, m.localeData());
        formatFunctions[format] = formatFunctions[format] || makeFormatFunction(format);

        return formatFunctions[format](m);
    }

    function expandFormat(format, locale) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
            return locale.longDateFormat(input) || input;
        }

        localFormattingTokens.lastIndex = 0;
        while (i >= 0 && localFormattingTokens.test(format)) {
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
            localFormattingTokens.lastIndex = 0;
            i -= 1;
        }

        return format;
    }

    var match1         = /\d/;            //       0 - 9
    var match2         = /\d\d/;          //      00 - 99
    var match3         = /\d{3}/;         //     000 - 999
    var match4         = /\d{4}/;         //    0000 - 9999
    var match6         = /[+-]?\d{6}/;    // -999999 - 999999
    var match1to2      = /\d\d?/;         //       0 - 99
    var match3to4      = /\d\d\d\d?/;     //     999 - 9999
    var match5to6      = /\d\d\d\d\d\d?/; //   99999 - 999999
    var match1to3      = /\d{1,3}/;       //       0 - 999
    var match1to4      = /\d{1,4}/;       //       0 - 9999
    var match1to6      = /[+-]?\d{1,6}/;  // -999999 - 999999

    var matchUnsigned  = /\d+/;           //       0 - inf
    var matchSigned    = /[+-]?\d+/;      //    -inf - inf

    var matchOffset    = /Z|[+-]\d\d:?\d\d/gi; // +00:00 -00:00 +0000 -0000 or Z
    var matchShortOffset = /Z|[+-]\d\d(?::?\d\d)?/gi; // +00 -00 +00:00 -00:00 +0000 -0000 or Z

    var matchTimestamp = /[+-]?\d+(\.\d{1,3})?/; // 123456789 123456789.123

    // any word (or two) characters or numbers including two/three word month in arabic.
    // includes scottish gaelic two word and hyphenated months
    var matchWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i;


    var regexes = {};

    function addRegexToken (token, regex, strictRegex) {
        regexes[token] = isFunction(regex) ? regex : function (isStrict, localeData) {
            return (isStrict && strictRegex) ? strictRegex : regex;
        };
    }

    function getParseRegexForToken (token, config) {
        if (!hasOwnProp(regexes, token)) {
            return new RegExp(unescapeFormat(token));
        }

        return regexes[token](config._strict, config._locale);
    }

    // Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
    function unescapeFormat(s) {
        return regexEscape(s.replace('\\', '').replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function (matched, p1, p2, p3, p4) {
            return p1 || p2 || p3 || p4;
        }));
    }

    function regexEscape(s) {
        return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    var tokens = {};

    function addParseToken (token, callback) {
        var i, func = callback;
        if (typeof token === 'string') {
            token = [token];
        }
        if (typeof callback === 'number') {
            func = function (input, array) {
                array[callback] = toInt(input);
            };
        }
        for (i = 0; i < token.length; i++) {
            tokens[token[i]] = func;
        }
    }

    function addWeekParseToken (token, callback) {
        addParseToken(token, function (input, array, config, token) {
            config._w = config._w || {};
            callback(input, config._w, config, token);
        });
    }

    function addTimeToArrayFromToken(token, input, config) {
        if (input != null && hasOwnProp(tokens, token)) {
            tokens[token](input, config._a, config, token);
        }
    }

    var YEAR = 0;
    var MONTH = 1;
    var DATE = 2;
    var HOUR = 3;
    var MINUTE = 4;
    var SECOND = 5;
    var MILLISECOND = 6;
    var WEEK = 7;
    var WEEKDAY = 8;

    function daysInMonth(year, month) {
        return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    }

    // FORMATTING

    addFormatToken('M', ['MM', 2], 'Mo', function () {
        return this.month() + 1;
    });

    addFormatToken('MMM', 0, 0, function (format) {
        return this.localeData().monthsShort(this, format);
    });

    addFormatToken('MMMM', 0, 0, function (format) {
        return this.localeData().months(this, format);
    });

    // ALIASES

    addUnitAlias('month', 'M');

    // PARSING

    addRegexToken('M',    match1to2);
    addRegexToken('MM',   match1to2, match2);
    addRegexToken('MMM',  function (isStrict, locale) {
        return locale.monthsShortRegex(isStrict);
    });
    addRegexToken('MMMM', function (isStrict, locale) {
        return locale.monthsRegex(isStrict);
    });

    addParseToken(['M', 'MM'], function (input, array) {
        array[MONTH] = toInt(input) - 1;
    });

    addParseToken(['MMM', 'MMMM'], function (input, array, config, token) {
        var month = config._locale.monthsParse(input, token, config._strict);
        // if we didn't find a month name, mark the date as invalid.
        if (month != null) {
            array[MONTH] = month;
        } else {
            getParsingFlags(config).invalidMonth = input;
        }
    });

    // LOCALES

    var MONTHS_IN_FORMAT = /D[oD]?(\[[^\[\]]*\]|\s+)+MMMM?/;
    var defaultLocaleMonths = 'January_February_March_April_May_June_July_August_September_October_November_December'.split('_');
    function localeMonths (m, format) {
        return isArray(this._months) ? this._months[m.month()] :
            this._months[MONTHS_IN_FORMAT.test(format) ? 'format' : 'standalone'][m.month()];
    }

    var defaultLocaleMonthsShort = 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_');
    function localeMonthsShort (m, format) {
        return isArray(this._monthsShort) ? this._monthsShort[m.month()] :
            this._monthsShort[MONTHS_IN_FORMAT.test(format) ? 'format' : 'standalone'][m.month()];
    }

    function localeMonthsParse (monthName, format, strict) {
        var i, mom, regex;

        if (!this._monthsParse) {
            this._monthsParse = [];
            this._longMonthsParse = [];
            this._shortMonthsParse = [];
        }

        for (i = 0; i < 12; i++) {
            // make the regex if we don't have it already
            mom = create_utc__createUTC([2000, i]);
            if (strict && !this._longMonthsParse[i]) {
                this._longMonthsParse[i] = new RegExp('^' + this.months(mom, '').replace('.', '') + '$', 'i');
                this._shortMonthsParse[i] = new RegExp('^' + this.monthsShort(mom, '').replace('.', '') + '$', 'i');
            }
            if (!strict && !this._monthsParse[i]) {
                regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
            }
            // test the regex
            if (strict && format === 'MMMM' && this._longMonthsParse[i].test(monthName)) {
                return i;
            } else if (strict && format === 'MMM' && this._shortMonthsParse[i].test(monthName)) {
                return i;
            } else if (!strict && this._monthsParse[i].test(monthName)) {
                return i;
            }
        }
    }

    // MOMENTS

    function setMonth (mom, value) {
        var dayOfMonth;

        if (!mom.isValid()) {
            // No op
            return mom;
        }

        // TODO: Move this out of here!
        if (typeof value === 'string') {
            value = mom.localeData().monthsParse(value);
            // TODO: Another silent failure?
            if (typeof value !== 'number') {
                return mom;
            }
        }

        dayOfMonth = Math.min(mom.date(), daysInMonth(mom.year(), value));
        mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
        return mom;
    }

    function getSetMonth (value) {
        if (value != null) {
            setMonth(this, value);
            utils_hooks__hooks.updateOffset(this, true);
            return this;
        } else {
            return get_set__get(this, 'Month');
        }
    }

    function getDaysInMonth () {
        return daysInMonth(this.year(), this.month());
    }

    var defaultMonthsShortRegex = matchWord;
    function monthsShortRegex (isStrict) {
        if (this._monthsParseExact) {
            if (!hasOwnProp(this, '_monthsRegex')) {
                computeMonthsParse.call(this);
            }
            if (isStrict) {
                return this._monthsShortStrictRegex;
            } else {
                return this._monthsShortRegex;
            }
        } else {
            return this._monthsShortStrictRegex && isStrict ?
                this._monthsShortStrictRegex : this._monthsShortRegex;
        }
    }

    var defaultMonthsRegex = matchWord;
    function monthsRegex (isStrict) {
        if (this._monthsParseExact) {
            if (!hasOwnProp(this, '_monthsRegex')) {
                computeMonthsParse.call(this);
            }
            if (isStrict) {
                return this._monthsStrictRegex;
            } else {
                return this._monthsRegex;
            }
        } else {
            return this._monthsStrictRegex && isStrict ?
                this._monthsStrictRegex : this._monthsRegex;
        }
    }

    function computeMonthsParse () {
        function cmpLenRev(a, b) {
            return b.length - a.length;
        }

        var shortPieces = [], longPieces = [], mixedPieces = [],
            i, mom;
        for (i = 0; i < 12; i++) {
            // make the regex if we don't have it already
            mom = create_utc__createUTC([2000, i]);
            shortPieces.push(this.monthsShort(mom, ''));
            longPieces.push(this.months(mom, ''));
            mixedPieces.push(this.months(mom, ''));
            mixedPieces.push(this.monthsShort(mom, ''));
        }
        // Sorting makes sure if one month (or abbr) is a prefix of another it
        // will match the longer piece.
        shortPieces.sort(cmpLenRev);
        longPieces.sort(cmpLenRev);
        mixedPieces.sort(cmpLenRev);
        for (i = 0; i < 12; i++) {
            shortPieces[i] = regexEscape(shortPieces[i]);
            longPieces[i] = regexEscape(longPieces[i]);
            mixedPieces[i] = regexEscape(mixedPieces[i]);
        }

        this._monthsRegex = new RegExp('^(' + mixedPieces.join('|') + ')', 'i');
        this._monthsShortRegex = this._monthsRegex;
        this._monthsStrictRegex = new RegExp('^(' + longPieces.join('|') + ')$', 'i');
        this._monthsShortStrictRegex = new RegExp('^(' + shortPieces.join('|') + ')$', 'i');
    }

    function checkOverflow (m) {
        var overflow;
        var a = m._a;

        if (a && getParsingFlags(m).overflow === -2) {
            overflow =
                a[MONTH]       < 0 || a[MONTH]       > 11  ? MONTH :
                a[DATE]        < 1 || a[DATE]        > daysInMonth(a[YEAR], a[MONTH]) ? DATE :
                a[HOUR]        < 0 || a[HOUR]        > 24 || (a[HOUR] === 24 && (a[MINUTE] !== 0 || a[SECOND] !== 0 || a[MILLISECOND] !== 0)) ? HOUR :
                a[MINUTE]      < 0 || a[MINUTE]      > 59  ? MINUTE :
                a[SECOND]      < 0 || a[SECOND]      > 59  ? SECOND :
                a[MILLISECOND] < 0 || a[MILLISECOND] > 999 ? MILLISECOND :
                -1;

            if (getParsingFlags(m)._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
                overflow = DATE;
            }
            if (getParsingFlags(m)._overflowWeeks && overflow === -1) {
                overflow = WEEK;
            }
            if (getParsingFlags(m)._overflowWeekday && overflow === -1) {
                overflow = WEEKDAY;
            }

            getParsingFlags(m).overflow = overflow;
        }

        return m;
    }

    function warn(msg) {
        if (utils_hooks__hooks.suppressDeprecationWarnings === false &&
                (typeof console !==  'undefined') && console.warn) {
            console.warn('Deprecation warning: ' + msg);
        }
    }

    function deprecate(msg, fn) {
        var firstTime = true;

        return extend(function () {
            if (firstTime) {
                warn(msg + '\nArguments: ' + Array.prototype.slice.call(arguments).join(', ') + '\n' + (new Error()).stack);
                firstTime = false;
            }
            return fn.apply(this, arguments);
        }, fn);
    }

    var deprecations = {};

    function deprecateSimple(name, msg) {
        if (!deprecations[name]) {
            warn(msg);
            deprecations[name] = true;
        }
    }

    utils_hooks__hooks.suppressDeprecationWarnings = false;

    // iso 8601 regex
    // 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
    var extendedIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})-(?:\d\d-\d\d|W\d\d-\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?::\d\d(?::\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?/;
    var basicIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})(?:\d\d\d\d|W\d\d\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?:\d\d(?:\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?/;

    var tzRegex = /Z|[+-]\d\d(?::?\d\d)?/;

    var isoDates = [
        ['YYYYYY-MM-DD', /[+-]\d{6}-\d\d-\d\d/],
        ['YYYY-MM-DD', /\d{4}-\d\d-\d\d/],
        ['GGGG-[W]WW-E', /\d{4}-W\d\d-\d/],
        ['GGGG-[W]WW', /\d{4}-W\d\d/, false],
        ['YYYY-DDD', /\d{4}-\d{3}/],
        ['YYYY-MM', /\d{4}-\d\d/, false],
        ['YYYYYYMMDD', /[+-]\d{10}/],
        ['YYYYMMDD', /\d{8}/],
        // YYYYMM is NOT allowed by the standard
        ['GGGG[W]WWE', /\d{4}W\d{3}/],
        ['GGGG[W]WW', /\d{4}W\d{2}/, false],
        ['YYYYDDD', /\d{7}/]
    ];

    // iso time formats and regexes
    var isoTimes = [
        ['HH:mm:ss.SSSS', /\d\d:\d\d:\d\d\.\d+/],
        ['HH:mm:ss,SSSS', /\d\d:\d\d:\d\d,\d+/],
        ['HH:mm:ss', /\d\d:\d\d:\d\d/],
        ['HH:mm', /\d\d:\d\d/],
        ['HHmmss.SSSS', /\d\d\d\d\d\d\.\d+/],
        ['HHmmss,SSSS', /\d\d\d\d\d\d,\d+/],
        ['HHmmss', /\d\d\d\d\d\d/],
        ['HHmm', /\d\d\d\d/],
        ['HH', /\d\d/]
    ];

    var aspNetJsonRegex = /^\/?Date\((\-?\d+)/i;

    // date from iso format
    function configFromISO(config) {
        var i, l,
            string = config._i,
            match = extendedIsoRegex.exec(string) || basicIsoRegex.exec(string),
            allowTime, dateFormat, timeFormat, tzFormat;

        if (match) {
            getParsingFlags(config).iso = true;

            for (i = 0, l = isoDates.length; i < l; i++) {
                if (isoDates[i][1].exec(match[1])) {
                    dateFormat = isoDates[i][0];
                    allowTime = isoDates[i][2] !== false;
                    break;
                }
            }
            if (dateFormat == null) {
                config._isValid = false;
                return;
            }
            if (match[3]) {
                for (i = 0, l = isoTimes.length; i < l; i++) {
                    if (isoTimes[i][1].exec(match[3])) {
                        // match[2] should be 'T' or space
                        timeFormat = (match[2] || ' ') + isoTimes[i][0];
                        break;
                    }
                }
                if (timeFormat == null) {
                    config._isValid = false;
                    return;
                }
            }
            if (!allowTime && timeFormat != null) {
                config._isValid = false;
                return;
            }
            if (match[4]) {
                if (tzRegex.exec(match[4])) {
                    tzFormat = 'Z';
                } else {
                    config._isValid = false;
                    return;
                }
            }
            config._f = dateFormat + (timeFormat || '') + (tzFormat || '');
            configFromStringAndFormat(config);
        } else {
            config._isValid = false;
        }
    }

    // date from iso format or fallback
    function configFromString(config) {
        var matched = aspNetJsonRegex.exec(config._i);

        if (matched !== null) {
            config._d = new Date(+matched[1]);
            return;
        }

        configFromISO(config);
        if (config._isValid === false) {
            delete config._isValid;
            utils_hooks__hooks.createFromInputFallback(config);
        }
    }

    utils_hooks__hooks.createFromInputFallback = deprecate(
        'moment construction falls back to js Date. This is ' +
        'discouraged and will be removed in upcoming major ' +
        'release. Please refer to ' +
        'https://github.com/moment/moment/issues/1407 for more info.',
        function (config) {
            config._d = new Date(config._i + (config._useUTC ? ' UTC' : ''));
        }
    );

    function createDate (y, m, d, h, M, s, ms) {
        //can't just apply() to create a date:
        //http://stackoverflow.com/questions/181348/instantiating-a-javascript-object-by-calling-prototype-constructor-apply
        var date = new Date(y, m, d, h, M, s, ms);

        //the date constructor remaps years 0-99 to 1900-1999
        if (y < 100 && y >= 0 && isFinite(date.getFullYear())) {
            date.setFullYear(y);
        }
        return date;
    }

    function createUTCDate (y) {
        var date = new Date(Date.UTC.apply(null, arguments));

        //the Date.UTC function remaps years 0-99 to 1900-1999
        if (y < 100 && y >= 0 && isFinite(date.getUTCFullYear())) {
            date.setUTCFullYear(y);
        }
        return date;
    }

    // FORMATTING

    addFormatToken('Y', 0, 0, function () {
        var y = this.year();
        return y <= 9999 ? '' + y : '+' + y;
    });

    addFormatToken(0, ['YY', 2], 0, function () {
        return this.year() % 100;
    });

    addFormatToken(0, ['YYYY',   4],       0, 'year');
    addFormatToken(0, ['YYYYY',  5],       0, 'year');
    addFormatToken(0, ['YYYYYY', 6, true], 0, 'year');

    // ALIASES

    addUnitAlias('year', 'y');

    // PARSING

    addRegexToken('Y',      matchSigned);
    addRegexToken('YY',     match1to2, match2);
    addRegexToken('YYYY',   match1to4, match4);
    addRegexToken('YYYYY',  match1to6, match6);
    addRegexToken('YYYYYY', match1to6, match6);

    addParseToken(['YYYYY', 'YYYYYY'], YEAR);
    addParseToken('YYYY', function (input, array) {
        array[YEAR] = input.length === 2 ? utils_hooks__hooks.parseTwoDigitYear(input) : toInt(input);
    });
    addParseToken('YY', function (input, array) {
        array[YEAR] = utils_hooks__hooks.parseTwoDigitYear(input);
    });
    addParseToken('Y', function (input, array) {
        array[YEAR] = parseInt(input, 10);
    });

    // HELPERS

    function daysInYear(year) {
        return isLeapYear(year) ? 366 : 365;
    }

    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    // HOOKS

    utils_hooks__hooks.parseTwoDigitYear = function (input) {
        return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
    };

    // MOMENTS

    var getSetYear = makeGetSet('FullYear', false);

    function getIsLeapYear () {
        return isLeapYear(this.year());
    }

    // start-of-first-week - start-of-year
    function firstWeekOffset(year, dow, doy) {
        var // first-week day -- which january is always in the first week (4 for iso, 1 for other)
            fwd = 7 + dow - doy,
            // first-week day local weekday -- which local weekday is fwd
            fwdlw = (7 + createUTCDate(year, 0, fwd).getUTCDay() - dow) % 7;

        return -fwdlw + fwd - 1;
    }

    //http://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
    function dayOfYearFromWeeks(year, week, weekday, dow, doy) {
        var localWeekday = (7 + weekday - dow) % 7,
            weekOffset = firstWeekOffset(year, dow, doy),
            dayOfYear = 1 + 7 * (week - 1) + localWeekday + weekOffset,
            resYear, resDayOfYear;

        if (dayOfYear <= 0) {
            resYear = year - 1;
            resDayOfYear = daysInYear(resYear) + dayOfYear;
        } else if (dayOfYear > daysInYear(year)) {
            resYear = year + 1;
            resDayOfYear = dayOfYear - daysInYear(year);
        } else {
            resYear = year;
            resDayOfYear = dayOfYear;
        }

        return {
            year: resYear,
            dayOfYear: resDayOfYear
        };
    }

    function weekOfYear(mom, dow, doy) {
        var weekOffset = firstWeekOffset(mom.year(), dow, doy),
            week = Math.floor((mom.dayOfYear() - weekOffset - 1) / 7) + 1,
            resWeek, resYear;

        if (week < 1) {
            resYear = mom.year() - 1;
            resWeek = week + weeksInYear(resYear, dow, doy);
        } else if (week > weeksInYear(mom.year(), dow, doy)) {
            resWeek = week - weeksInYear(mom.year(), dow, doy);
            resYear = mom.year() + 1;
        } else {
            resYear = mom.year();
            resWeek = week;
        }

        return {
            week: resWeek,
            year: resYear
        };
    }

    function weeksInYear(year, dow, doy) {
        var weekOffset = firstWeekOffset(year, dow, doy),
            weekOffsetNext = firstWeekOffset(year + 1, dow, doy);
        return (daysInYear(year) - weekOffset + weekOffsetNext) / 7;
    }

    // Pick the first defined of two or three arguments.
    function defaults(a, b, c) {
        if (a != null) {
            return a;
        }
        if (b != null) {
            return b;
        }
        return c;
    }

    function currentDateArray(config) {
        // hooks is actually the exported moment object
        var nowValue = new Date(utils_hooks__hooks.now());
        if (config._useUTC) {
            return [nowValue.getUTCFullYear(), nowValue.getUTCMonth(), nowValue.getUTCDate()];
        }
        return [nowValue.getFullYear(), nowValue.getMonth(), nowValue.getDate()];
    }

    // convert an array to a date.
    // the array should mirror the parameters below
    // note: all values past the year are optional and will default to the lowest possible value.
    // [year, month, day , hour, minute, second, millisecond]
    function configFromArray (config) {
        var i, date, input = [], currentDate, yearToUse;

        if (config._d) {
            return;
        }

        currentDate = currentDateArray(config);

        //compute day of the year from weeks and weekdays
        if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
            dayOfYearFromWeekInfo(config);
        }

        //if the day of the year is set, figure out what it is
        if (config._dayOfYear) {
            yearToUse = defaults(config._a[YEAR], currentDate[YEAR]);

            if (config._dayOfYear > daysInYear(yearToUse)) {
                getParsingFlags(config)._overflowDayOfYear = true;
            }

            date = createUTCDate(yearToUse, 0, config._dayOfYear);
            config._a[MONTH] = date.getUTCMonth();
            config._a[DATE] = date.getUTCDate();
        }

        // Default to current date.
        // * if no year, month, day of month are given, default to today
        // * if day of month is given, default month and year
        // * if month is given, default only year
        // * if year is given, don't default anything
        for (i = 0; i < 3 && config._a[i] == null; ++i) {
            config._a[i] = input[i] = currentDate[i];
        }

        // Zero out whatever was not defaulted, including time
        for (; i < 7; i++) {
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        // Check for 24:00:00.000
        if (config._a[HOUR] === 24 &&
                config._a[MINUTE] === 0 &&
                config._a[SECOND] === 0 &&
                config._a[MILLISECOND] === 0) {
            config._nextDay = true;
            config._a[HOUR] = 0;
        }

        config._d = (config._useUTC ? createUTCDate : createDate).apply(null, input);
        // Apply timezone offset from input. The actual utcOffset can be changed
        // with parseZone.
        if (config._tzm != null) {
            config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);
        }

        if (config._nextDay) {
            config._a[HOUR] = 24;
        }
    }

    function dayOfYearFromWeekInfo(config) {
        var w, weekYear, week, weekday, dow, doy, temp, weekdayOverflow;

        w = config._w;
        if (w.GG != null || w.W != null || w.E != null) {
            dow = 1;
            doy = 4;

            // TODO: We need to take the current isoWeekYear, but that depends on
            // how we interpret now (local, utc, fixed offset). So create
            // a now version of current config (take local/utc/offset flags, and
            // create now).
            weekYear = defaults(w.GG, config._a[YEAR], weekOfYear(local__createLocal(), 1, 4).year);
            week = defaults(w.W, 1);
            weekday = defaults(w.E, 1);
            if (weekday < 1 || weekday > 7) {
                weekdayOverflow = true;
            }
        } else {
            dow = config._locale._week.dow;
            doy = config._locale._week.doy;

            weekYear = defaults(w.gg, config._a[YEAR], weekOfYear(local__createLocal(), dow, doy).year);
            week = defaults(w.w, 1);

            if (w.d != null) {
                // weekday -- low day numbers are considered next week
                weekday = w.d;
                if (weekday < 0 || weekday > 6) {
                    weekdayOverflow = true;
                }
            } else if (w.e != null) {
                // local weekday -- counting starts from begining of week
                weekday = w.e + dow;
                if (w.e < 0 || w.e > 6) {
                    weekdayOverflow = true;
                }
            } else {
                // default to begining of week
                weekday = dow;
            }
        }
        if (week < 1 || week > weeksInYear(weekYear, dow, doy)) {
            getParsingFlags(config)._overflowWeeks = true;
        } else if (weekdayOverflow != null) {
            getParsingFlags(config)._overflowWeekday = true;
        } else {
            temp = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy);
            config._a[YEAR] = temp.year;
            config._dayOfYear = temp.dayOfYear;
        }
    }

    // constant that refers to the ISO standard
    utils_hooks__hooks.ISO_8601 = function () {};

    // date from string and format string
    function configFromStringAndFormat(config) {
        // TODO: Move this to another part of the creation flow to prevent circular deps
        if (config._f === utils_hooks__hooks.ISO_8601) {
            configFromISO(config);
            return;
        }

        config._a = [];
        getParsingFlags(config).empty = true;

        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var string = '' + config._i,
            i, parsedInput, tokens, token, skipped,
            stringLength = string.length,
            totalParsedInputLength = 0;

        tokens = expandFormat(config._f, config._locale).match(formattingTokens) || [];

        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
            // console.log('token', token, 'parsedInput', parsedInput,
            //         'regex', getParseRegexForToken(token, config));
            if (parsedInput) {
                skipped = string.substr(0, string.indexOf(parsedInput));
                if (skipped.length > 0) {
                    getParsingFlags(config).unusedInput.push(skipped);
                }
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
                totalParsedInputLength += parsedInput.length;
            }
            // don't parse if it's not a known token
            if (formatTokenFunctions[token]) {
                if (parsedInput) {
                    getParsingFlags(config).empty = false;
                }
                else {
                    getParsingFlags(config).unusedTokens.push(token);
                }
                addTimeToArrayFromToken(token, parsedInput, config);
            }
            else if (config._strict && !parsedInput) {
                getParsingFlags(config).unusedTokens.push(token);
            }
        }

        // add remaining unparsed input length to the string
        getParsingFlags(config).charsLeftOver = stringLength - totalParsedInputLength;
        if (string.length > 0) {
            getParsingFlags(config).unusedInput.push(string);
        }

        // clear _12h flag if hour is <= 12
        if (getParsingFlags(config).bigHour === true &&
                config._a[HOUR] <= 12 &&
                config._a[HOUR] > 0) {
            getParsingFlags(config).bigHour = undefined;
        }
        // handle meridiem
        config._a[HOUR] = meridiemFixWrap(config._locale, config._a[HOUR], config._meridiem);

        configFromArray(config);
        checkOverflow(config);
    }


    function meridiemFixWrap (locale, hour, meridiem) {
        var isPm;

        if (meridiem == null) {
            // nothing to do
            return hour;
        }
        if (locale.meridiemHour != null) {
            return locale.meridiemHour(hour, meridiem);
        } else if (locale.isPM != null) {
            // Fallback
            isPm = locale.isPM(meridiem);
            if (isPm && hour < 12) {
                hour += 12;
            }
            if (!isPm && hour === 12) {
                hour = 0;
            }
            return hour;
        } else {
            // this is not supposed to happen
            return hour;
        }
    }

    // date from string and array of format strings
    function configFromStringAndArray(config) {
        var tempConfig,
            bestMoment,

            scoreToBeat,
            i,
            currentScore;

        if (config._f.length === 0) {
            getParsingFlags(config).invalidFormat = true;
            config._d = new Date(NaN);
            return;
        }

        for (i = 0; i < config._f.length; i++) {
            currentScore = 0;
            tempConfig = copyConfig({}, config);
            if (config._useUTC != null) {
                tempConfig._useUTC = config._useUTC;
            }
            tempConfig._f = config._f[i];
            configFromStringAndFormat(tempConfig);

            if (!valid__isValid(tempConfig)) {
                continue;
            }

            // if there is any input that was not parsed add a penalty for that format
            currentScore += getParsingFlags(tempConfig).charsLeftOver;

            //or tokens
            currentScore += getParsingFlags(tempConfig).unusedTokens.length * 10;

            getParsingFlags(tempConfig).score = currentScore;

            if (scoreToBeat == null || currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempConfig;
            }
        }

        extend(config, bestMoment || tempConfig);
    }

    function configFromObject(config) {
        if (config._d) {
            return;
        }

        var i = normalizeObjectUnits(config._i);
        config._a = map([i.year, i.month, i.day || i.date, i.hour, i.minute, i.second, i.millisecond], function (obj) {
            return obj && parseInt(obj, 10);
        });

        configFromArray(config);
    }

    function createFromConfig (config) {
        var res = new Moment(checkOverflow(prepareConfig(config)));
        if (res._nextDay) {
            // Adding is smart enough around DST
            res.add(1, 'd');
            res._nextDay = undefined;
        }

        return res;
    }

    function prepareConfig (config) {
        var input = config._i,
            format = config._f;

        config._locale = config._locale || locale_locales__getLocale(config._l);

        if (input === null || (format === undefined && input === '')) {
            return valid__createInvalid({nullInput: true});
        }

        if (typeof input === 'string') {
            config._i = input = config._locale.preparse(input);
        }

        if (isMoment(input)) {
            return new Moment(checkOverflow(input));
        } else if (isArray(format)) {
            configFromStringAndArray(config);
        } else if (format) {
            configFromStringAndFormat(config);
        } else if (isDate(input)) {
            config._d = input;
        } else {
            configFromInput(config);
        }

        if (!valid__isValid(config)) {
            config._d = null;
        }

        return config;
    }

    function configFromInput(config) {
        var input = config._i;
        if (input === undefined) {
            config._d = new Date(utils_hooks__hooks.now());
        } else if (isDate(input)) {
            config._d = new Date(+input);
        } else if (typeof input === 'string') {
            configFromString(config);
        } else if (isArray(input)) {
            config._a = map(input.slice(0), function (obj) {
                return parseInt(obj, 10);
            });
            configFromArray(config);
        } else if (typeof(input) === 'object') {
            configFromObject(config);
        } else if (typeof(input) === 'number') {
            // from milliseconds
            config._d = new Date(input);
        } else {
            utils_hooks__hooks.createFromInputFallback(config);
        }
    }

    function createLocalOrUTC (input, format, locale, strict, isUTC) {
        var c = {};

        if (typeof(locale) === 'boolean') {
            strict = locale;
            locale = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c._isAMomentObject = true;
        c._useUTC = c._isUTC = isUTC;
        c._l = locale;
        c._i = input;
        c._f = format;
        c._strict = strict;

        return createFromConfig(c);
    }

    function local__createLocal (input, format, locale, strict) {
        return createLocalOrUTC(input, format, locale, strict, false);
    }

    var prototypeMin = deprecate(
         'moment().min is deprecated, use moment.min instead. https://github.com/moment/moment/issues/1548',
         function () {
             var other = local__createLocal.apply(null, arguments);
             if (this.isValid() && other.isValid()) {
                 return other < this ? this : other;
             } else {
                 return valid__createInvalid();
             }
         }
     );

    var prototypeMax = deprecate(
        'moment().max is deprecated, use moment.max instead. https://github.com/moment/moment/issues/1548',
        function () {
            var other = local__createLocal.apply(null, arguments);
            if (this.isValid() && other.isValid()) {
                return other > this ? this : other;
            } else {
                return valid__createInvalid();
            }
        }
    );

    // Pick a moment m from moments so that m[fn](other) is true for all
    // other. This relies on the function fn to be transitive.
    //
    // moments should either be an array of moment objects or an array, whose
    // first element is an array of moment objects.
    function pickBy(fn, moments) {
        var res, i;
        if (moments.length === 1 && isArray(moments[0])) {
            moments = moments[0];
        }
        if (!moments.length) {
            return local__createLocal();
        }
        res = moments[0];
        for (i = 1; i < moments.length; ++i) {
            if (!moments[i].isValid() || moments[i][fn](res)) {
                res = moments[i];
            }
        }
        return res;
    }

    // TODO: Use [].sort instead?
    function min () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isBefore', args);
    }

    function max () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isAfter', args);
    }

    var now = function () {
        return Date.now ? Date.now() : +(new Date());
    };

    function Duration (duration) {
        var normalizedInput = normalizeObjectUnits(duration),
            years = normalizedInput.year || 0,
            quarters = normalizedInput.quarter || 0,
            months = normalizedInput.month || 0,
            weeks = normalizedInput.week || 0,
            days = normalizedInput.day || 0,
            hours = normalizedInput.hour || 0,
            minutes = normalizedInput.minute || 0,
            seconds = normalizedInput.second || 0,
            milliseconds = normalizedInput.millisecond || 0;

        // representation for dateAddRemove
        this._milliseconds = +milliseconds +
            seconds * 1e3 + // 1000
            minutes * 6e4 + // 1000 * 60
            hours * 36e5; // 1000 * 60 * 60
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = +days +
            weeks * 7;
        // It is impossible translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = +months +
            quarters * 3 +
            years * 12;

        this._data = {};

        this._locale = locale_locales__getLocale();

        this._bubble();
    }

    function isDuration (obj) {
        return obj instanceof Duration;
    }

    // FORMATTING

    function offset (token, separator) {
        addFormatToken(token, 0, 0, function () {
            var offset = this.utcOffset();
            var sign = '+';
            if (offset < 0) {
                offset = -offset;
                sign = '-';
            }
            return sign + zeroFill(~~(offset / 60), 2) + separator + zeroFill(~~(offset) % 60, 2);
        });
    }

    offset('Z', ':');
    offset('ZZ', '');

    // PARSING

    addRegexToken('Z',  matchShortOffset);
    addRegexToken('ZZ', matchShortOffset);
    addParseToken(['Z', 'ZZ'], function (input, array, config) {
        config._useUTC = true;
        config._tzm = offsetFromString(matchShortOffset, input);
    });

    // HELPERS

    // timezone chunker
    // '+10:00' > ['10',  '00']
    // '-1530'  > ['-15', '30']
    var chunkOffset = /([\+\-]|\d\d)/gi;

    function offsetFromString(matcher, string) {
        var matches = ((string || '').match(matcher) || []);
        var chunk   = matches[matches.length - 1] || [];
        var parts   = (chunk + '').match(chunkOffset) || ['-', 0, 0];
        var minutes = +(parts[1] * 60) + toInt(parts[2]);

        return parts[0] === '+' ? minutes : -minutes;
    }

    // Return a moment from input, that is local/utc/zone equivalent to model.
    function cloneWithOffset(input, model) {
        var res, diff;
        if (model._isUTC) {
            res = model.clone();
            diff = (isMoment(input) || isDate(input) ? +input : +local__createLocal(input)) - (+res);
            // Use low-level api, because this fn is low-level api.
            res._d.setTime(+res._d + diff);
            utils_hooks__hooks.updateOffset(res, false);
            return res;
        } else {
            return local__createLocal(input).local();
        }
    }

    function getDateOffset (m) {
        // On Firefox.24 Date#getTimezoneOffset returns a floating point.
        // https://github.com/moment/moment/pull/1871
        return -Math.round(m._d.getTimezoneOffset() / 15) * 15;
    }

    // HOOKS

    // This function will be called whenever a moment is mutated.
    // It is intended to keep the offset in sync with the timezone.
    utils_hooks__hooks.updateOffset = function () {};

    // MOMENTS

    // keepLocalTime = true means only change the timezone, without
    // affecting the local hour. So 5:31:26 +0300 --[utcOffset(2, true)]-->
    // 5:31:26 +0200 It is possible that 5:31:26 doesn't exist with offset
    // +0200, so we adjust the time as needed, to be valid.
    //
    // Keeping the time actually adds/subtracts (one hour)
    // from the actual represented time. That is why we call updateOffset
    // a second time. In case it wants us to change the offset again
    // _changeInProgress == true case, then we have to adjust, because
    // there is no such time in the given timezone.
    function getSetOffset (input, keepLocalTime) {
        var offset = this._offset || 0,
            localAdjust;
        if (!this.isValid()) {
            return input != null ? this : NaN;
        }
        if (input != null) {
            if (typeof input === 'string') {
                input = offsetFromString(matchShortOffset, input);
            } else if (Math.abs(input) < 16) {
                input = input * 60;
            }
            if (!this._isUTC && keepLocalTime) {
                localAdjust = getDateOffset(this);
            }
            this._offset = input;
            this._isUTC = true;
            if (localAdjust != null) {
                this.add(localAdjust, 'm');
            }
            if (offset !== input) {
                if (!keepLocalTime || this._changeInProgress) {
                    add_subtract__addSubtract(this, create__createDuration(input - offset, 'm'), 1, false);
                } else if (!this._changeInProgress) {
                    this._changeInProgress = true;
                    utils_hooks__hooks.updateOffset(this, true);
                    this._changeInProgress = null;
                }
            }
            return this;
        } else {
            return this._isUTC ? offset : getDateOffset(this);
        }
    }

    function getSetZone (input, keepLocalTime) {
        if (input != null) {
            if (typeof input !== 'string') {
                input = -input;
            }

            this.utcOffset(input, keepLocalTime);

            return this;
        } else {
            return -this.utcOffset();
        }
    }

    function setOffsetToUTC (keepLocalTime) {
        return this.utcOffset(0, keepLocalTime);
    }

    function setOffsetToLocal (keepLocalTime) {
        if (this._isUTC) {
            this.utcOffset(0, keepLocalTime);
            this._isUTC = false;

            if (keepLocalTime) {
                this.subtract(getDateOffset(this), 'm');
            }
        }
        return this;
    }

    function setOffsetToParsedOffset () {
        if (this._tzm) {
            this.utcOffset(this._tzm);
        } else if (typeof this._i === 'string') {
            this.utcOffset(offsetFromString(matchOffset, this._i));
        }
        return this;
    }

    function hasAlignedHourOffset (input) {
        if (!this.isValid()) {
            return false;
        }
        input = input ? local__createLocal(input).utcOffset() : 0;

        return (this.utcOffset() - input) % 60 === 0;
    }

    function isDaylightSavingTime () {
        return (
            this.utcOffset() > this.clone().month(0).utcOffset() ||
            this.utcOffset() > this.clone().month(5).utcOffset()
        );
    }

    function isDaylightSavingTimeShifted () {
        if (!isUndefined(this._isDSTShifted)) {
            return this._isDSTShifted;
        }

        var c = {};

        copyConfig(c, this);
        c = prepareConfig(c);

        if (c._a) {
            var other = c._isUTC ? create_utc__createUTC(c._a) : local__createLocal(c._a);
            this._isDSTShifted = this.isValid() &&
                compareArrays(c._a, other.toArray()) > 0;
        } else {
            this._isDSTShifted = false;
        }

        return this._isDSTShifted;
    }

    function isLocal () {
        return this.isValid() ? !this._isUTC : false;
    }

    function isUtcOffset () {
        return this.isValid() ? this._isUTC : false;
    }

    function isUtc () {
        return this.isValid() ? this._isUTC && this._offset === 0 : false;
    }

    // ASP.NET json date format regex
    var aspNetRegex = /^(\-)?(?:(\d*)[. ])?(\d+)\:(\d+)(?:\:(\d+)\.?(\d{3})?\d*)?$/;

    // from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
    // somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
    var isoRegex = /^(-)?P(?:(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?|([0-9,.]*)W)$/;

    function create__createDuration (input, key) {
        var duration = input,
            // matching against regexp is expensive, do it on demand
            match = null,
            sign,
            ret,
            diffRes;

        if (isDuration(input)) {
            duration = {
                ms : input._milliseconds,
                d  : input._days,
                M  : input._months
            };
        } else if (typeof input === 'number') {
            duration = {};
            if (key) {
                duration[key] = input;
            } else {
                duration.milliseconds = input;
            }
        } else if (!!(match = aspNetRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            duration = {
                y  : 0,
                d  : toInt(match[DATE])        * sign,
                h  : toInt(match[HOUR])        * sign,
                m  : toInt(match[MINUTE])      * sign,
                s  : toInt(match[SECOND])      * sign,
                ms : toInt(match[MILLISECOND]) * sign
            };
        } else if (!!(match = isoRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            duration = {
                y : parseIso(match[2], sign),
                M : parseIso(match[3], sign),
                d : parseIso(match[4], sign),
                h : parseIso(match[5], sign),
                m : parseIso(match[6], sign),
                s : parseIso(match[7], sign),
                w : parseIso(match[8], sign)
            };
        } else if (duration == null) {// checks for null or undefined
            duration = {};
        } else if (typeof duration === 'object' && ('from' in duration || 'to' in duration)) {
            diffRes = momentsDifference(local__createLocal(duration.from), local__createLocal(duration.to));

            duration = {};
            duration.ms = diffRes.milliseconds;
            duration.M = diffRes.months;
        }

        ret = new Duration(duration);

        if (isDuration(input) && hasOwnProp(input, '_locale')) {
            ret._locale = input._locale;
        }

        return ret;
    }

    create__createDuration.fn = Duration.prototype;

    function parseIso (inp, sign) {
        // We'd normally use ~~inp for this, but unfortunately it also
        // converts floats to ints.
        // inp may be undefined, so careful calling replace on it.
        var res = inp && parseFloat(inp.replace(',', '.'));
        // apply sign while we're at it
        return (isNaN(res) ? 0 : res) * sign;
    }

    function positiveMomentsDifference(base, other) {
        var res = {milliseconds: 0, months: 0};

        res.months = other.month() - base.month() +
            (other.year() - base.year()) * 12;
        if (base.clone().add(res.months, 'M').isAfter(other)) {
            --res.months;
        }

        res.milliseconds = +other - +(base.clone().add(res.months, 'M'));

        return res;
    }

    function momentsDifference(base, other) {
        var res;
        if (!(base.isValid() && other.isValid())) {
            return {milliseconds: 0, months: 0};
        }

        other = cloneWithOffset(other, base);
        if (base.isBefore(other)) {
            res = positiveMomentsDifference(base, other);
        } else {
            res = positiveMomentsDifference(other, base);
            res.milliseconds = -res.milliseconds;
            res.months = -res.months;
        }

        return res;
    }

    // TODO: remove 'name' arg after deprecation is removed
    function createAdder(direction, name) {
        return function (val, period) {
            var dur, tmp;
            //invert the arguments, but complain about it
            if (period !== null && !isNaN(+period)) {
                deprecateSimple(name, 'moment().' + name  + '(period, number) is deprecated. Please use moment().' + name + '(number, period).');
                tmp = val; val = period; period = tmp;
            }

            val = typeof val === 'string' ? +val : val;
            dur = create__createDuration(val, period);
            add_subtract__addSubtract(this, dur, direction);
            return this;
        };
    }

    function add_subtract__addSubtract (mom, duration, isAdding, updateOffset) {
        var milliseconds = duration._milliseconds,
            days = duration._days,
            months = duration._months;

        if (!mom.isValid()) {
            // No op
            return;
        }

        updateOffset = updateOffset == null ? true : updateOffset;

        if (milliseconds) {
            mom._d.setTime(+mom._d + milliseconds * isAdding);
        }
        if (days) {
            get_set__set(mom, 'Date', get_set__get(mom, 'Date') + days * isAdding);
        }
        if (months) {
            setMonth(mom, get_set__get(mom, 'Month') + months * isAdding);
        }
        if (updateOffset) {
            utils_hooks__hooks.updateOffset(mom, days || months);
        }
    }

    var add_subtract__add      = createAdder(1, 'add');
    var add_subtract__subtract = createAdder(-1, 'subtract');

    function moment_calendar__calendar (time, formats) {
        // We want to compare the start of today, vs this.
        // Getting start-of-today depends on whether we're local/utc/offset or not.
        var now = time || local__createLocal(),
            sod = cloneWithOffset(now, this).startOf('day'),
            diff = this.diff(sod, 'days', true),
            format = diff < -6 ? 'sameElse' :
                diff < -1 ? 'lastWeek' :
                diff < 0 ? 'lastDay' :
                diff < 1 ? 'sameDay' :
                diff < 2 ? 'nextDay' :
                diff < 7 ? 'nextWeek' : 'sameElse';

        var output = formats && (isFunction(formats[format]) ? formats[format]() : formats[format]);

        return this.format(output || this.localeData().calendar(format, this, local__createLocal(now)));
    }

    function clone () {
        return new Moment(this);
    }

    function isAfter (input, units) {
        var localInput = isMoment(input) ? input : local__createLocal(input);
        if (!(this.isValid() && localInput.isValid())) {
            return false;
        }
        units = normalizeUnits(!isUndefined(units) ? units : 'millisecond');
        if (units === 'millisecond') {
            return +this > +localInput;
        } else {
            return +localInput < +this.clone().startOf(units);
        }
    }

    function isBefore (input, units) {
        var localInput = isMoment(input) ? input : local__createLocal(input);
        if (!(this.isValid() && localInput.isValid())) {
            return false;
        }
        units = normalizeUnits(!isUndefined(units) ? units : 'millisecond');
        if (units === 'millisecond') {
            return +this < +localInput;
        } else {
            return +this.clone().endOf(units) < +localInput;
        }
    }

    function isBetween (from, to, units) {
        return this.isAfter(from, units) && this.isBefore(to, units);
    }

    function isSame (input, units) {
        var localInput = isMoment(input) ? input : local__createLocal(input),
            inputMs;
        if (!(this.isValid() && localInput.isValid())) {
            return false;
        }
        units = normalizeUnits(units || 'millisecond');
        if (units === 'millisecond') {
            return +this === +localInput;
        } else {
            inputMs = +localInput;
            return +(this.clone().startOf(units)) <= inputMs && inputMs <= +(this.clone().endOf(units));
        }
    }

    function isSameOrAfter (input, units) {
        return this.isSame(input, units) || this.isAfter(input,units);
    }

    function isSameOrBefore (input, units) {
        return this.isSame(input, units) || this.isBefore(input,units);
    }

    function diff (input, units, asFloat) {
        var that,
            zoneDelta,
            delta, output;

        if (!this.isValid()) {
            return NaN;
        }

        that = cloneWithOffset(input, this);

        if (!that.isValid()) {
            return NaN;
        }

        zoneDelta = (that.utcOffset() - this.utcOffset()) * 6e4;

        units = normalizeUnits(units);

        if (units === 'year' || units === 'month' || units === 'quarter') {
            output = monthDiff(this, that);
            if (units === 'quarter') {
                output = output / 3;
            } else if (units === 'year') {
                output = output / 12;
            }
        } else {
            delta = this - that;
            output = units === 'second' ? delta / 1e3 : // 1000
                units === 'minute' ? delta / 6e4 : // 1000 * 60
                units === 'hour' ? delta / 36e5 : // 1000 * 60 * 60
                units === 'day' ? (delta - zoneDelta) / 864e5 : // 1000 * 60 * 60 * 24, negate dst
                units === 'week' ? (delta - zoneDelta) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst
                delta;
        }
        return asFloat ? output : absFloor(output);
    }

    function monthDiff (a, b) {
        // difference in months
        var wholeMonthDiff = ((b.year() - a.year()) * 12) + (b.month() - a.month()),
            // b is in (anchor - 1 month, anchor + 1 month)
            anchor = a.clone().add(wholeMonthDiff, 'months'),
            anchor2, adjust;

        if (b - anchor < 0) {
            anchor2 = a.clone().add(wholeMonthDiff - 1, 'months');
            // linear across the month
            adjust = (b - anchor) / (anchor - anchor2);
        } else {
            anchor2 = a.clone().add(wholeMonthDiff + 1, 'months');
            // linear across the month
            adjust = (b - anchor) / (anchor2 - anchor);
        }

        return -(wholeMonthDiff + adjust);
    }

    utils_hooks__hooks.defaultFormat = 'YYYY-MM-DDTHH:mm:ssZ';

    function toString () {
        return this.clone().locale('en').format('ddd MMM DD YYYY HH:mm:ss [GMT]ZZ');
    }

    function moment_format__toISOString () {
        var m = this.clone().utc();
        if (0 < m.year() && m.year() <= 9999) {
            if (isFunction(Date.prototype.toISOString)) {
                // native implementation is ~50x faster, use it when we can
                return this.toDate().toISOString();
            } else {
                return formatMoment(m, 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
            }
        } else {
            return formatMoment(m, 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
        }
    }

    function format (inputString) {
        var output = formatMoment(this, inputString || utils_hooks__hooks.defaultFormat);
        return this.localeData().postformat(output);
    }

    function from (time, withoutSuffix) {
        if (this.isValid() &&
                ((isMoment(time) && time.isValid()) ||
                 local__createLocal(time).isValid())) {
            return create__createDuration({to: this, from: time}).locale(this.locale()).humanize(!withoutSuffix);
        } else {
            return this.localeData().invalidDate();
        }
    }

    function fromNow (withoutSuffix) {
        return this.from(local__createLocal(), withoutSuffix);
    }

    function to (time, withoutSuffix) {
        if (this.isValid() &&
                ((isMoment(time) && time.isValid()) ||
                 local__createLocal(time).isValid())) {
            return create__createDuration({from: this, to: time}).locale(this.locale()).humanize(!withoutSuffix);
        } else {
            return this.localeData().invalidDate();
        }
    }

    function toNow (withoutSuffix) {
        return this.to(local__createLocal(), withoutSuffix);
    }

    // If passed a locale key, it will set the locale for this
    // instance.  Otherwise, it will return the locale configuration
    // variables for this instance.
    function locale (key) {
        var newLocaleData;

        if (key === undefined) {
            return this._locale._abbr;
        } else {
            newLocaleData = locale_locales__getLocale(key);
            if (newLocaleData != null) {
                this._locale = newLocaleData;
            }
            return this;
        }
    }

    var lang = deprecate(
        'moment().lang() is deprecated. Instead, use moment().localeData() to get the language configuration. Use moment().locale() to change languages.',
        function (key) {
            if (key === undefined) {
                return this.localeData();
            } else {
                return this.locale(key);
            }
        }
    );

    function localeData () {
        return this._locale;
    }

    function startOf (units) {
        units = normalizeUnits(units);
        // the following switch intentionally omits break keywords
        // to utilize falling through the cases.
        switch (units) {
        case 'year':
            this.month(0);
            /* falls through */
        case 'quarter':
        case 'month':
            this.date(1);
            /* falls through */
        case 'week':
        case 'isoWeek':
        case 'day':
            this.hours(0);
            /* falls through */
        case 'hour':
            this.minutes(0);
            /* falls through */
        case 'minute':
            this.seconds(0);
            /* falls through */
        case 'second':
            this.milliseconds(0);
        }

        // weeks are a special case
        if (units === 'week') {
            this.weekday(0);
        }
        if (units === 'isoWeek') {
            this.isoWeekday(1);
        }

        // quarters are also special
        if (units === 'quarter') {
            this.month(Math.floor(this.month() / 3) * 3);
        }

        return this;
    }

    function endOf (units) {
        units = normalizeUnits(units);
        if (units === undefined || units === 'millisecond') {
            return this;
        }
        return this.startOf(units).add(1, (units === 'isoWeek' ? 'week' : units)).subtract(1, 'ms');
    }

    function to_type__valueOf () {
        return +this._d - ((this._offset || 0) * 60000);
    }

    function unix () {
        return Math.floor(+this / 1000);
    }

    function toDate () {
        return this._offset ? new Date(+this) : this._d;
    }

    function toArray () {
        var m = this;
        return [m.year(), m.month(), m.date(), m.hour(), m.minute(), m.second(), m.millisecond()];
    }

    function toObject () {
        var m = this;
        return {
            years: m.year(),
            months: m.month(),
            date: m.date(),
            hours: m.hours(),
            minutes: m.minutes(),
            seconds: m.seconds(),
            milliseconds: m.milliseconds()
        };
    }

    function toJSON () {
        // JSON.stringify(new Date(NaN)) === 'null'
        return this.isValid() ? this.toISOString() : 'null';
    }

    function moment_valid__isValid () {
        return valid__isValid(this);
    }

    function parsingFlags () {
        return extend({}, getParsingFlags(this));
    }

    function invalidAt () {
        return getParsingFlags(this).overflow;
    }

    function creationData() {
        return {
            input: this._i,
            format: this._f,
            locale: this._locale,
            isUTC: this._isUTC,
            strict: this._strict
        };
    }

    // FORMATTING

    addFormatToken(0, ['gg', 2], 0, function () {
        return this.weekYear() % 100;
    });

    addFormatToken(0, ['GG', 2], 0, function () {
        return this.isoWeekYear() % 100;
    });

    function addWeekYearFormatToken (token, getter) {
        addFormatToken(0, [token, token.length], 0, getter);
    }

    addWeekYearFormatToken('gggg',     'weekYear');
    addWeekYearFormatToken('ggggg',    'weekYear');
    addWeekYearFormatToken('GGGG',  'isoWeekYear');
    addWeekYearFormatToken('GGGGG', 'isoWeekYear');

    // ALIASES

    addUnitAlias('weekYear', 'gg');
    addUnitAlias('isoWeekYear', 'GG');

    // PARSING

    addRegexToken('G',      matchSigned);
    addRegexToken('g',      matchSigned);
    addRegexToken('GG',     match1to2, match2);
    addRegexToken('gg',     match1to2, match2);
    addRegexToken('GGGG',   match1to4, match4);
    addRegexToken('gggg',   match1to4, match4);
    addRegexToken('GGGGG',  match1to6, match6);
    addRegexToken('ggggg',  match1to6, match6);

    addWeekParseToken(['gggg', 'ggggg', 'GGGG', 'GGGGG'], function (input, week, config, token) {
        week[token.substr(0, 2)] = toInt(input);
    });

    addWeekParseToken(['gg', 'GG'], function (input, week, config, token) {
        week[token] = utils_hooks__hooks.parseTwoDigitYear(input);
    });

    // MOMENTS

    function getSetWeekYear (input) {
        return getSetWeekYearHelper.call(this,
                input,
                this.week(),
                this.weekday(),
                this.localeData()._week.dow,
                this.localeData()._week.doy);
    }

    function getSetISOWeekYear (input) {
        return getSetWeekYearHelper.call(this,
                input, this.isoWeek(), this.isoWeekday(), 1, 4);
    }

    function getISOWeeksInYear () {
        return weeksInYear(this.year(), 1, 4);
    }

    function getWeeksInYear () {
        var weekInfo = this.localeData()._week;
        return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
    }

    function getSetWeekYearHelper(input, week, weekday, dow, doy) {
        var weeksTarget;
        if (input == null) {
            return weekOfYear(this, dow, doy).year;
        } else {
            weeksTarget = weeksInYear(input, dow, doy);
            if (week > weeksTarget) {
                week = weeksTarget;
            }
            return setWeekAll.call(this, input, week, weekday, dow, doy);
        }
    }

    function setWeekAll(weekYear, week, weekday, dow, doy) {
        var dayOfYearData = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy),
            date = createUTCDate(dayOfYearData.year, 0, dayOfYearData.dayOfYear);

        // console.log("got", weekYear, week, weekday, "set", date.toISOString());
        this.year(date.getUTCFullYear());
        this.month(date.getUTCMonth());
        this.date(date.getUTCDate());
        return this;
    }

    // FORMATTING

    addFormatToken('Q', 0, 'Qo', 'quarter');

    // ALIASES

    addUnitAlias('quarter', 'Q');

    // PARSING

    addRegexToken('Q', match1);
    addParseToken('Q', function (input, array) {
        array[MONTH] = (toInt(input) - 1) * 3;
    });

    // MOMENTS

    function getSetQuarter (input) {
        return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
    }

    // FORMATTING

    addFormatToken('w', ['ww', 2], 'wo', 'week');
    addFormatToken('W', ['WW', 2], 'Wo', 'isoWeek');

    // ALIASES

    addUnitAlias('week', 'w');
    addUnitAlias('isoWeek', 'W');

    // PARSING

    addRegexToken('w',  match1to2);
    addRegexToken('ww', match1to2, match2);
    addRegexToken('W',  match1to2);
    addRegexToken('WW', match1to2, match2);

    addWeekParseToken(['w', 'ww', 'W', 'WW'], function (input, week, config, token) {
        week[token.substr(0, 1)] = toInt(input);
    });

    // HELPERS

    // LOCALES

    function localeWeek (mom) {
        return weekOfYear(mom, this._week.dow, this._week.doy).week;
    }

    var defaultLocaleWeek = {
        dow : 0, // Sunday is the first day of the week.
        doy : 6  // The week that contains Jan 1st is the first week of the year.
    };

    function localeFirstDayOfWeek () {
        return this._week.dow;
    }

    function localeFirstDayOfYear () {
        return this._week.doy;
    }

    // MOMENTS

    function getSetWeek (input) {
        var week = this.localeData().week(this);
        return input == null ? week : this.add((input - week) * 7, 'd');
    }

    function getSetISOWeek (input) {
        var week = weekOfYear(this, 1, 4).week;
        return input == null ? week : this.add((input - week) * 7, 'd');
    }

    // FORMATTING

    addFormatToken('D', ['DD', 2], 'Do', 'date');

    // ALIASES

    addUnitAlias('date', 'D');

    // PARSING

    addRegexToken('D',  match1to2);
    addRegexToken('DD', match1to2, match2);
    addRegexToken('Do', function (isStrict, locale) {
        return isStrict ? locale._ordinalParse : locale._ordinalParseLenient;
    });

    addParseToken(['D', 'DD'], DATE);
    addParseToken('Do', function (input, array) {
        array[DATE] = toInt(input.match(match1to2)[0], 10);
    });

    // MOMENTS

    var getSetDayOfMonth = makeGetSet('Date', true);

    // FORMATTING

    addFormatToken('d', 0, 'do', 'day');

    addFormatToken('dd', 0, 0, function (format) {
        return this.localeData().weekdaysMin(this, format);
    });

    addFormatToken('ddd', 0, 0, function (format) {
        return this.localeData().weekdaysShort(this, format);
    });

    addFormatToken('dddd', 0, 0, function (format) {
        return this.localeData().weekdays(this, format);
    });

    addFormatToken('e', 0, 0, 'weekday');
    addFormatToken('E', 0, 0, 'isoWeekday');

    // ALIASES

    addUnitAlias('day', 'd');
    addUnitAlias('weekday', 'e');
    addUnitAlias('isoWeekday', 'E');

    // PARSING

    addRegexToken('d',    match1to2);
    addRegexToken('e',    match1to2);
    addRegexToken('E',    match1to2);
    addRegexToken('dd',   matchWord);
    addRegexToken('ddd',  matchWord);
    addRegexToken('dddd', matchWord);

    addWeekParseToken(['dd', 'ddd', 'dddd'], function (input, week, config, token) {
        var weekday = config._locale.weekdaysParse(input, token, config._strict);
        // if we didn't get a weekday name, mark the date as invalid
        if (weekday != null) {
            week.d = weekday;
        } else {
            getParsingFlags(config).invalidWeekday = input;
        }
    });

    addWeekParseToken(['d', 'e', 'E'], function (input, week, config, token) {
        week[token] = toInt(input);
    });

    // HELPERS

    function parseWeekday(input, locale) {
        if (typeof input !== 'string') {
            return input;
        }

        if (!isNaN(input)) {
            return parseInt(input, 10);
        }

        input = locale.weekdaysParse(input);
        if (typeof input === 'number') {
            return input;
        }

        return null;
    }

    // LOCALES

    var defaultLocaleWeekdays = 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_');
    function localeWeekdays (m, format) {
        return isArray(this._weekdays) ? this._weekdays[m.day()] :
            this._weekdays[this._weekdays.isFormat.test(format) ? 'format' : 'standalone'][m.day()];
    }

    var defaultLocaleWeekdaysShort = 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_');
    function localeWeekdaysShort (m) {
        return this._weekdaysShort[m.day()];
    }

    var defaultLocaleWeekdaysMin = 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_');
    function localeWeekdaysMin (m) {
        return this._weekdaysMin[m.day()];
    }

    function localeWeekdaysParse (weekdayName, format, strict) {
        var i, mom, regex;

        if (!this._weekdaysParse) {
            this._weekdaysParse = [];
            this._minWeekdaysParse = [];
            this._shortWeekdaysParse = [];
            this._fullWeekdaysParse = [];
        }

        for (i = 0; i < 7; i++) {
            // make the regex if we don't have it already

            mom = local__createLocal([2000, 1]).day(i);
            if (strict && !this._fullWeekdaysParse[i]) {
                this._fullWeekdaysParse[i] = new RegExp('^' + this.weekdays(mom, '').replace('.', '\.?') + '$', 'i');
                this._shortWeekdaysParse[i] = new RegExp('^' + this.weekdaysShort(mom, '').replace('.', '\.?') + '$', 'i');
                this._minWeekdaysParse[i] = new RegExp('^' + this.weekdaysMin(mom, '').replace('.', '\.?') + '$', 'i');
            }
            if (!this._weekdaysParse[i]) {
                regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
            }
            // test the regex
            if (strict && format === 'dddd' && this._fullWeekdaysParse[i].test(weekdayName)) {
                return i;
            } else if (strict && format === 'ddd' && this._shortWeekdaysParse[i].test(weekdayName)) {
                return i;
            } else if (strict && format === 'dd' && this._minWeekdaysParse[i].test(weekdayName)) {
                return i;
            } else if (!strict && this._weekdaysParse[i].test(weekdayName)) {
                return i;
            }
        }
    }

    // MOMENTS

    function getSetDayOfWeek (input) {
        if (!this.isValid()) {
            return input != null ? this : NaN;
        }
        var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
        if (input != null) {
            input = parseWeekday(input, this.localeData());
            return this.add(input - day, 'd');
        } else {
            return day;
        }
    }

    function getSetLocaleDayOfWeek (input) {
        if (!this.isValid()) {
            return input != null ? this : NaN;
        }
        var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
        return input == null ? weekday : this.add(input - weekday, 'd');
    }

    function getSetISODayOfWeek (input) {
        if (!this.isValid()) {
            return input != null ? this : NaN;
        }
        // behaves the same as moment#day except
        // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
        // as a setter, sunday should belong to the previous week.
        return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);
    }

    // FORMATTING

    addFormatToken('DDD', ['DDDD', 3], 'DDDo', 'dayOfYear');

    // ALIASES

    addUnitAlias('dayOfYear', 'DDD');

    // PARSING

    addRegexToken('DDD',  match1to3);
    addRegexToken('DDDD', match3);
    addParseToken(['DDD', 'DDDD'], function (input, array, config) {
        config._dayOfYear = toInt(input);
    });

    // HELPERS

    // MOMENTS

    function getSetDayOfYear (input) {
        var dayOfYear = Math.round((this.clone().startOf('day') - this.clone().startOf('year')) / 864e5) + 1;
        return input == null ? dayOfYear : this.add((input - dayOfYear), 'd');
    }

    // FORMATTING

    function hFormat() {
        return this.hours() % 12 || 12;
    }

    addFormatToken('H', ['HH', 2], 0, 'hour');
    addFormatToken('h', ['hh', 2], 0, hFormat);

    addFormatToken('hmm', 0, 0, function () {
        return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2);
    });

    addFormatToken('hmmss', 0, 0, function () {
        return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2) +
            zeroFill(this.seconds(), 2);
    });

    addFormatToken('Hmm', 0, 0, function () {
        return '' + this.hours() + zeroFill(this.minutes(), 2);
    });

    addFormatToken('Hmmss', 0, 0, function () {
        return '' + this.hours() + zeroFill(this.minutes(), 2) +
            zeroFill(this.seconds(), 2);
    });

    function meridiem (token, lowercase) {
        addFormatToken(token, 0, 0, function () {
            return this.localeData().meridiem(this.hours(), this.minutes(), lowercase);
        });
    }

    meridiem('a', true);
    meridiem('A', false);

    // ALIASES

    addUnitAlias('hour', 'h');

    // PARSING

    function matchMeridiem (isStrict, locale) {
        return locale._meridiemParse;
    }

    addRegexToken('a',  matchMeridiem);
    addRegexToken('A',  matchMeridiem);
    addRegexToken('H',  match1to2);
    addRegexToken('h',  match1to2);
    addRegexToken('HH', match1to2, match2);
    addRegexToken('hh', match1to2, match2);

    addRegexToken('hmm', match3to4);
    addRegexToken('hmmss', match5to6);
    addRegexToken('Hmm', match3to4);
    addRegexToken('Hmmss', match5to6);

    addParseToken(['H', 'HH'], HOUR);
    addParseToken(['a', 'A'], function (input, array, config) {
        config._isPm = config._locale.isPM(input);
        config._meridiem = input;
    });
    addParseToken(['h', 'hh'], function (input, array, config) {
        array[HOUR] = toInt(input);
        getParsingFlags(config).bigHour = true;
    });
    addParseToken('hmm', function (input, array, config) {
        var pos = input.length - 2;
        array[HOUR] = toInt(input.substr(0, pos));
        array[MINUTE] = toInt(input.substr(pos));
        getParsingFlags(config).bigHour = true;
    });
    addParseToken('hmmss', function (input, array, config) {
        var pos1 = input.length - 4;
        var pos2 = input.length - 2;
        array[HOUR] = toInt(input.substr(0, pos1));
        array[MINUTE] = toInt(input.substr(pos1, 2));
        array[SECOND] = toInt(input.substr(pos2));
        getParsingFlags(config).bigHour = true;
    });
    addParseToken('Hmm', function (input, array, config) {
        var pos = input.length - 2;
        array[HOUR] = toInt(input.substr(0, pos));
        array[MINUTE] = toInt(input.substr(pos));
    });
    addParseToken('Hmmss', function (input, array, config) {
        var pos1 = input.length - 4;
        var pos2 = input.length - 2;
        array[HOUR] = toInt(input.substr(0, pos1));
        array[MINUTE] = toInt(input.substr(pos1, 2));
        array[SECOND] = toInt(input.substr(pos2));
    });

    // LOCALES

    function localeIsPM (input) {
        // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
        // Using charAt should be more compatible.
        return ((input + '').toLowerCase().charAt(0) === 'p');
    }

    var defaultLocaleMeridiemParse = /[ap]\.?m?\.?/i;
    function localeMeridiem (hours, minutes, isLower) {
        if (hours > 11) {
            return isLower ? 'pm' : 'PM';
        } else {
            return isLower ? 'am' : 'AM';
        }
    }


    // MOMENTS

    // Setting the hour should keep the time, because the user explicitly
    // specified which hour he wants. So trying to maintain the same hour (in
    // a new timezone) makes sense. Adding/subtracting hours does not follow
    // this rule.
    var getSetHour = makeGetSet('Hours', true);

    // FORMATTING

    addFormatToken('m', ['mm', 2], 0, 'minute');

    // ALIASES

    addUnitAlias('minute', 'm');

    // PARSING

    addRegexToken('m',  match1to2);
    addRegexToken('mm', match1to2, match2);
    addParseToken(['m', 'mm'], MINUTE);

    // MOMENTS

    var getSetMinute = makeGetSet('Minutes', false);

    // FORMATTING

    addFormatToken('s', ['ss', 2], 0, 'second');

    // ALIASES

    addUnitAlias('second', 's');

    // PARSING

    addRegexToken('s',  match1to2);
    addRegexToken('ss', match1to2, match2);
    addParseToken(['s', 'ss'], SECOND);

    // MOMENTS

    var getSetSecond = makeGetSet('Seconds', false);

    // FORMATTING

    addFormatToken('S', 0, 0, function () {
        return ~~(this.millisecond() / 100);
    });

    addFormatToken(0, ['SS', 2], 0, function () {
        return ~~(this.millisecond() / 10);
    });

    addFormatToken(0, ['SSS', 3], 0, 'millisecond');
    addFormatToken(0, ['SSSS', 4], 0, function () {
        return this.millisecond() * 10;
    });
    addFormatToken(0, ['SSSSS', 5], 0, function () {
        return this.millisecond() * 100;
    });
    addFormatToken(0, ['SSSSSS', 6], 0, function () {
        return this.millisecond() * 1000;
    });
    addFormatToken(0, ['SSSSSSS', 7], 0, function () {
        return this.millisecond() * 10000;
    });
    addFormatToken(0, ['SSSSSSSS', 8], 0, function () {
        return this.millisecond() * 100000;
    });
    addFormatToken(0, ['SSSSSSSSS', 9], 0, function () {
        return this.millisecond() * 1000000;
    });


    // ALIASES

    addUnitAlias('millisecond', 'ms');

    // PARSING

    addRegexToken('S',    match1to3, match1);
    addRegexToken('SS',   match1to3, match2);
    addRegexToken('SSS',  match1to3, match3);

    var token;
    for (token = 'SSSS'; token.length <= 9; token += 'S') {
        addRegexToken(token, matchUnsigned);
    }

    function parseMs(input, array) {
        array[MILLISECOND] = toInt(('0.' + input) * 1000);
    }

    for (token = 'S'; token.length <= 9; token += 'S') {
        addParseToken(token, parseMs);
    }
    // MOMENTS

    var getSetMillisecond = makeGetSet('Milliseconds', false);

    // FORMATTING

    addFormatToken('z',  0, 0, 'zoneAbbr');
    addFormatToken('zz', 0, 0, 'zoneName');

    // MOMENTS

    function getZoneAbbr () {
        return this._isUTC ? 'UTC' : '';
    }

    function getZoneName () {
        return this._isUTC ? 'Coordinated Universal Time' : '';
    }

    var momentPrototype__proto = Moment.prototype;

    momentPrototype__proto.add               = add_subtract__add;
    momentPrototype__proto.calendar          = moment_calendar__calendar;
    momentPrototype__proto.clone             = clone;
    momentPrototype__proto.diff              = diff;
    momentPrototype__proto.endOf             = endOf;
    momentPrototype__proto.format            = format;
    momentPrototype__proto.from              = from;
    momentPrototype__proto.fromNow           = fromNow;
    momentPrototype__proto.to                = to;
    momentPrototype__proto.toNow             = toNow;
    momentPrototype__proto.get               = getSet;
    momentPrototype__proto.invalidAt         = invalidAt;
    momentPrototype__proto.isAfter           = isAfter;
    momentPrototype__proto.isBefore          = isBefore;
    momentPrototype__proto.isBetween         = isBetween;
    momentPrototype__proto.isSame            = isSame;
    momentPrototype__proto.isSameOrAfter     = isSameOrAfter;
    momentPrototype__proto.isSameOrBefore    = isSameOrBefore;
    momentPrototype__proto.isValid           = moment_valid__isValid;
    momentPrototype__proto.lang              = lang;
    momentPrototype__proto.locale            = locale;
    momentPrototype__proto.localeData        = localeData;
    momentPrototype__proto.max               = prototypeMax;
    momentPrototype__proto.min               = prototypeMin;
    momentPrototype__proto.parsingFlags      = parsingFlags;
    momentPrototype__proto.set               = getSet;
    momentPrototype__proto.startOf           = startOf;
    momentPrototype__proto.subtract          = add_subtract__subtract;
    momentPrototype__proto.toArray           = toArray;
    momentPrototype__proto.toObject          = toObject;
    momentPrototype__proto.toDate            = toDate;
    momentPrototype__proto.toISOString       = moment_format__toISOString;
    momentPrototype__proto.toJSON            = toJSON;
    momentPrototype__proto.toString          = toString;
    momentPrototype__proto.unix              = unix;
    momentPrototype__proto.valueOf           = to_type__valueOf;
    momentPrototype__proto.creationData      = creationData;

    // Year
    momentPrototype__proto.year       = getSetYear;
    momentPrototype__proto.isLeapYear = getIsLeapYear;

    // Week Year
    momentPrototype__proto.weekYear    = getSetWeekYear;
    momentPrototype__proto.isoWeekYear = getSetISOWeekYear;

    // Quarter
    momentPrototype__proto.quarter = momentPrototype__proto.quarters = getSetQuarter;

    // Month
    momentPrototype__proto.month       = getSetMonth;
    momentPrototype__proto.daysInMonth = getDaysInMonth;

    // Week
    momentPrototype__proto.week           = momentPrototype__proto.weeks        = getSetWeek;
    momentPrototype__proto.isoWeek        = momentPrototype__proto.isoWeeks     = getSetISOWeek;
    momentPrototype__proto.weeksInYear    = getWeeksInYear;
    momentPrototype__proto.isoWeeksInYear = getISOWeeksInYear;

    // Day
    momentPrototype__proto.date       = getSetDayOfMonth;
    momentPrototype__proto.day        = momentPrototype__proto.days             = getSetDayOfWeek;
    momentPrototype__proto.weekday    = getSetLocaleDayOfWeek;
    momentPrototype__proto.isoWeekday = getSetISODayOfWeek;
    momentPrototype__proto.dayOfYear  = getSetDayOfYear;

    // Hour
    momentPrototype__proto.hour = momentPrototype__proto.hours = getSetHour;

    // Minute
    momentPrototype__proto.minute = momentPrototype__proto.minutes = getSetMinute;

    // Second
    momentPrototype__proto.second = momentPrototype__proto.seconds = getSetSecond;

    // Millisecond
    momentPrototype__proto.millisecond = momentPrototype__proto.milliseconds = getSetMillisecond;

    // Offset
    momentPrototype__proto.utcOffset            = getSetOffset;
    momentPrototype__proto.utc                  = setOffsetToUTC;
    momentPrototype__proto.local                = setOffsetToLocal;
    momentPrototype__proto.parseZone            = setOffsetToParsedOffset;
    momentPrototype__proto.hasAlignedHourOffset = hasAlignedHourOffset;
    momentPrototype__proto.isDST                = isDaylightSavingTime;
    momentPrototype__proto.isDSTShifted         = isDaylightSavingTimeShifted;
    momentPrototype__proto.isLocal              = isLocal;
    momentPrototype__proto.isUtcOffset          = isUtcOffset;
    momentPrototype__proto.isUtc                = isUtc;
    momentPrototype__proto.isUTC                = isUtc;

    // Timezone
    momentPrototype__proto.zoneAbbr = getZoneAbbr;
    momentPrototype__proto.zoneName = getZoneName;

    // Deprecations
    momentPrototype__proto.dates  = deprecate('dates accessor is deprecated. Use date instead.', getSetDayOfMonth);
    momentPrototype__proto.months = deprecate('months accessor is deprecated. Use month instead', getSetMonth);
    momentPrototype__proto.years  = deprecate('years accessor is deprecated. Use year instead', getSetYear);
    momentPrototype__proto.zone   = deprecate('moment().zone is deprecated, use moment().utcOffset instead. https://github.com/moment/moment/issues/1779', getSetZone);

    var momentPrototype = momentPrototype__proto;

    function moment__createUnix (input) {
        return local__createLocal(input * 1000);
    }

    function moment__createInZone () {
        return local__createLocal.apply(null, arguments).parseZone();
    }

    var defaultCalendar = {
        sameDay : '[Today at] LT',
        nextDay : '[Tomorrow at] LT',
        nextWeek : 'dddd [at] LT',
        lastDay : '[Yesterday at] LT',
        lastWeek : '[Last] dddd [at] LT',
        sameElse : 'L'
    };

    function locale_calendar__calendar (key, mom, now) {
        var output = this._calendar[key];
        return isFunction(output) ? output.call(mom, now) : output;
    }

    var defaultLongDateFormat = {
        LTS  : 'h:mm:ss A',
        LT   : 'h:mm A',
        L    : 'MM/DD/YYYY',
        LL   : 'MMMM D, YYYY',
        LLL  : 'MMMM D, YYYY h:mm A',
        LLLL : 'dddd, MMMM D, YYYY h:mm A'
    };

    function longDateFormat (key) {
        var format = this._longDateFormat[key],
            formatUpper = this._longDateFormat[key.toUpperCase()];

        if (format || !formatUpper) {
            return format;
        }

        this._longDateFormat[key] = formatUpper.replace(/MMMM|MM|DD|dddd/g, function (val) {
            return val.slice(1);
        });

        return this._longDateFormat[key];
    }

    var defaultInvalidDate = 'Invalid date';

    function invalidDate () {
        return this._invalidDate;
    }

    var defaultOrdinal = '%d';
    var defaultOrdinalParse = /\d{1,2}/;

    function ordinal (number) {
        return this._ordinal.replace('%d', number);
    }

    function preParsePostFormat (string) {
        return string;
    }

    var defaultRelativeTime = {
        future : 'in %s',
        past   : '%s ago',
        s  : 'a few seconds',
        m  : 'a minute',
        mm : '%d minutes',
        h  : 'an hour',
        hh : '%d hours',
        d  : 'a day',
        dd : '%d days',
        M  : 'a month',
        MM : '%d months',
        y  : 'a year',
        yy : '%d years'
    };

    function relative__relativeTime (number, withoutSuffix, string, isFuture) {
        var output = this._relativeTime[string];
        return (isFunction(output)) ?
            output(number, withoutSuffix, string, isFuture) :
            output.replace(/%d/i, number);
    }

    function pastFuture (diff, output) {
        var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
        return isFunction(format) ? format(output) : format.replace(/%s/i, output);
    }

    function locale_set__set (config) {
        var prop, i;
        for (i in config) {
            prop = config[i];
            if (isFunction(prop)) {
                this[i] = prop;
            } else {
                this['_' + i] = prop;
            }
        }
        // Lenient ordinal parsing accepts just a number in addition to
        // number + (possibly) stuff coming from _ordinalParseLenient.
        this._ordinalParseLenient = new RegExp(this._ordinalParse.source + '|' + (/\d{1,2}/).source);
    }

    var prototype__proto = Locale.prototype;

    prototype__proto._calendar       = defaultCalendar;
    prototype__proto.calendar        = locale_calendar__calendar;
    prototype__proto._longDateFormat = defaultLongDateFormat;
    prototype__proto.longDateFormat  = longDateFormat;
    prototype__proto._invalidDate    = defaultInvalidDate;
    prototype__proto.invalidDate     = invalidDate;
    prototype__proto._ordinal        = defaultOrdinal;
    prototype__proto.ordinal         = ordinal;
    prototype__proto._ordinalParse   = defaultOrdinalParse;
    prototype__proto.preparse        = preParsePostFormat;
    prototype__proto.postformat      = preParsePostFormat;
    prototype__proto._relativeTime   = defaultRelativeTime;
    prototype__proto.relativeTime    = relative__relativeTime;
    prototype__proto.pastFuture      = pastFuture;
    prototype__proto.set             = locale_set__set;

    // Month
    prototype__proto.months            =        localeMonths;
    prototype__proto._months           = defaultLocaleMonths;
    prototype__proto.monthsShort       =        localeMonthsShort;
    prototype__proto._monthsShort      = defaultLocaleMonthsShort;
    prototype__proto.monthsParse       =        localeMonthsParse;
    prototype__proto._monthsRegex      = defaultMonthsRegex;
    prototype__proto.monthsRegex       = monthsRegex;
    prototype__proto._monthsShortRegex = defaultMonthsShortRegex;
    prototype__proto.monthsShortRegex  = monthsShortRegex;

    // Week
    prototype__proto.week = localeWeek;
    prototype__proto._week = defaultLocaleWeek;
    prototype__proto.firstDayOfYear = localeFirstDayOfYear;
    prototype__proto.firstDayOfWeek = localeFirstDayOfWeek;

    // Day of Week
    prototype__proto.weekdays       =        localeWeekdays;
    prototype__proto._weekdays      = defaultLocaleWeekdays;
    prototype__proto.weekdaysMin    =        localeWeekdaysMin;
    prototype__proto._weekdaysMin   = defaultLocaleWeekdaysMin;
    prototype__proto.weekdaysShort  =        localeWeekdaysShort;
    prototype__proto._weekdaysShort = defaultLocaleWeekdaysShort;
    prototype__proto.weekdaysParse  =        localeWeekdaysParse;

    // Hours
    prototype__proto.isPM = localeIsPM;
    prototype__proto._meridiemParse = defaultLocaleMeridiemParse;
    prototype__proto.meridiem = localeMeridiem;

    function lists__get (format, index, field, setter) {
        var locale = locale_locales__getLocale();
        var utc = create_utc__createUTC().set(setter, index);
        return locale[field](utc, format);
    }

    function list (format, index, field, count, setter) {
        if (typeof format === 'number') {
            index = format;
            format = undefined;
        }

        format = format || '';

        if (index != null) {
            return lists__get(format, index, field, setter);
        }

        var i;
        var out = [];
        for (i = 0; i < count; i++) {
            out[i] = lists__get(format, i, field, setter);
        }
        return out;
    }

    function lists__listMonths (format, index) {
        return list(format, index, 'months', 12, 'month');
    }

    function lists__listMonthsShort (format, index) {
        return list(format, index, 'monthsShort', 12, 'month');
    }

    function lists__listWeekdays (format, index) {
        return list(format, index, 'weekdays', 7, 'day');
    }

    function lists__listWeekdaysShort (format, index) {
        return list(format, index, 'weekdaysShort', 7, 'day');
    }

    function lists__listWeekdaysMin (format, index) {
        return list(format, index, 'weekdaysMin', 7, 'day');
    }

    locale_locales__getSetGlobalLocale('en', {
        ordinalParse: /\d{1,2}(th|st|nd|rd)/,
        ordinal : function (number) {
            var b = number % 10,
                output = (toInt(number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });

    // Side effect imports
    utils_hooks__hooks.lang = deprecate('moment.lang is deprecated. Use moment.locale instead.', locale_locales__getSetGlobalLocale);
    utils_hooks__hooks.langData = deprecate('moment.langData is deprecated. Use moment.localeData instead.', locale_locales__getLocale);

    var mathAbs = Math.abs;

    function duration_abs__abs () {
        var data           = this._data;

        this._milliseconds = mathAbs(this._milliseconds);
        this._days         = mathAbs(this._days);
        this._months       = mathAbs(this._months);

        data.milliseconds  = mathAbs(data.milliseconds);
        data.seconds       = mathAbs(data.seconds);
        data.minutes       = mathAbs(data.minutes);
        data.hours         = mathAbs(data.hours);
        data.months        = mathAbs(data.months);
        data.years         = mathAbs(data.years);

        return this;
    }

    function duration_add_subtract__addSubtract (duration, input, value, direction) {
        var other = create__createDuration(input, value);

        duration._milliseconds += direction * other._milliseconds;
        duration._days         += direction * other._days;
        duration._months       += direction * other._months;

        return duration._bubble();
    }

    // supports only 2.0-style add(1, 's') or add(duration)
    function duration_add_subtract__add (input, value) {
        return duration_add_subtract__addSubtract(this, input, value, 1);
    }

    // supports only 2.0-style subtract(1, 's') or subtract(duration)
    function duration_add_subtract__subtract (input, value) {
        return duration_add_subtract__addSubtract(this, input, value, -1);
    }

    function absCeil (number) {
        if (number < 0) {
            return Math.floor(number);
        } else {
            return Math.ceil(number);
        }
    }

    function bubble () {
        var milliseconds = this._milliseconds;
        var days         = this._days;
        var months       = this._months;
        var data         = this._data;
        var seconds, minutes, hours, years, monthsFromDays;

        // if we have a mix of positive and negative values, bubble down first
        // check: https://github.com/moment/moment/issues/2166
        if (!((milliseconds >= 0 && days >= 0 && months >= 0) ||
                (milliseconds <= 0 && days <= 0 && months <= 0))) {
            milliseconds += absCeil(monthsToDays(months) + days) * 864e5;
            days = 0;
            months = 0;
        }

        // The following code bubbles up values, see the tests for
        // examples of what that means.
        data.milliseconds = milliseconds % 1000;

        seconds           = absFloor(milliseconds / 1000);
        data.seconds      = seconds % 60;

        minutes           = absFloor(seconds / 60);
        data.minutes      = minutes % 60;

        hours             = absFloor(minutes / 60);
        data.hours        = hours % 24;

        days += absFloor(hours / 24);

        // convert days to months
        monthsFromDays = absFloor(daysToMonths(days));
        months += monthsFromDays;
        days -= absCeil(monthsToDays(monthsFromDays));

        // 12 months -> 1 year
        years = absFloor(months / 12);
        months %= 12;

        data.days   = days;
        data.months = months;
        data.years  = years;

        return this;
    }

    function daysToMonths (days) {
        // 400 years have 146097 days (taking into account leap year rules)
        // 400 years have 12 months === 4800
        return days * 4800 / 146097;
    }

    function monthsToDays (months) {
        // the reverse of daysToMonths
        return months * 146097 / 4800;
    }

    function as (units) {
        var days;
        var months;
        var milliseconds = this._milliseconds;

        units = normalizeUnits(units);

        if (units === 'month' || units === 'year') {
            days   = this._days   + milliseconds / 864e5;
            months = this._months + daysToMonths(days);
            return units === 'month' ? months : months / 12;
        } else {
            // handle milliseconds separately because of floating point math errors (issue #1867)
            days = this._days + Math.round(monthsToDays(this._months));
            switch (units) {
                case 'week'   : return days / 7     + milliseconds / 6048e5;
                case 'day'    : return days         + milliseconds / 864e5;
                case 'hour'   : return days * 24    + milliseconds / 36e5;
                case 'minute' : return days * 1440  + milliseconds / 6e4;
                case 'second' : return days * 86400 + milliseconds / 1000;
                // Math.floor prevents floating point math errors here
                case 'millisecond': return Math.floor(days * 864e5) + milliseconds;
                default: throw new Error('Unknown unit ' + units);
            }
        }
    }

    // TODO: Use this.as('ms')?
    function duration_as__valueOf () {
        return (
            this._milliseconds +
            this._days * 864e5 +
            (this._months % 12) * 2592e6 +
            toInt(this._months / 12) * 31536e6
        );
    }

    function makeAs (alias) {
        return function () {
            return this.as(alias);
        };
    }

    var asMilliseconds = makeAs('ms');
    var asSeconds      = makeAs('s');
    var asMinutes      = makeAs('m');
    var asHours        = makeAs('h');
    var asDays         = makeAs('d');
    var asWeeks        = makeAs('w');
    var asMonths       = makeAs('M');
    var asYears        = makeAs('y');

    function duration_get__get (units) {
        units = normalizeUnits(units);
        return this[units + 's']();
    }

    function makeGetter(name) {
        return function () {
            return this._data[name];
        };
    }

    var milliseconds = makeGetter('milliseconds');
    var seconds      = makeGetter('seconds');
    var minutes      = makeGetter('minutes');
    var hours        = makeGetter('hours');
    var days         = makeGetter('days');
    var months       = makeGetter('months');
    var years        = makeGetter('years');

    function weeks () {
        return absFloor(this.days() / 7);
    }

    var round = Math.round;
    var thresholds = {
        s: 45,  // seconds to minute
        m: 45,  // minutes to hour
        h: 22,  // hours to day
        d: 26,  // days to month
        M: 11   // months to year
    };

    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
        return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }

    function duration_humanize__relativeTime (posNegDuration, withoutSuffix, locale) {
        var duration = create__createDuration(posNegDuration).abs();
        var seconds  = round(duration.as('s'));
        var minutes  = round(duration.as('m'));
        var hours    = round(duration.as('h'));
        var days     = round(duration.as('d'));
        var months   = round(duration.as('M'));
        var years    = round(duration.as('y'));

        var a = seconds < thresholds.s && ['s', seconds]  ||
                minutes <= 1           && ['m']           ||
                minutes < thresholds.m && ['mm', minutes] ||
                hours   <= 1           && ['h']           ||
                hours   < thresholds.h && ['hh', hours]   ||
                days    <= 1           && ['d']           ||
                days    < thresholds.d && ['dd', days]    ||
                months  <= 1           && ['M']           ||
                months  < thresholds.M && ['MM', months]  ||
                years   <= 1           && ['y']           || ['yy', years];

        a[2] = withoutSuffix;
        a[3] = +posNegDuration > 0;
        a[4] = locale;
        return substituteTimeAgo.apply(null, a);
    }

    // This function allows you to set a threshold for relative time strings
    function duration_humanize__getSetRelativeTimeThreshold (threshold, limit) {
        if (thresholds[threshold] === undefined) {
            return false;
        }
        if (limit === undefined) {
            return thresholds[threshold];
        }
        thresholds[threshold] = limit;
        return true;
    }

    function humanize (withSuffix) {
        var locale = this.localeData();
        var output = duration_humanize__relativeTime(this, !withSuffix, locale);

        if (withSuffix) {
            output = locale.pastFuture(+this, output);
        }

        return locale.postformat(output);
    }

    var iso_string__abs = Math.abs;

    function iso_string__toISOString() {
        // for ISO strings we do not use the normal bubbling rules:
        //  * milliseconds bubble up until they become hours
        //  * days do not bubble at all
        //  * months bubble up until they become years
        // This is because there is no context-free conversion between hours and days
        // (think of clock changes)
        // and also not between days and months (28-31 days per month)
        var seconds = iso_string__abs(this._milliseconds) / 1000;
        var days         = iso_string__abs(this._days);
        var months       = iso_string__abs(this._months);
        var minutes, hours, years;

        // 3600 seconds -> 60 minutes -> 1 hour
        minutes           = absFloor(seconds / 60);
        hours             = absFloor(minutes / 60);
        seconds %= 60;
        minutes %= 60;

        // 12 months -> 1 year
        years  = absFloor(months / 12);
        months %= 12;


        // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
        var Y = years;
        var M = months;
        var D = days;
        var h = hours;
        var m = minutes;
        var s = seconds;
        var total = this.asSeconds();

        if (!total) {
            // this is the same as C#'s (Noda) and python (isodate)...
            // but not other JS (goog.date)
            return 'P0D';
        }

        return (total < 0 ? '-' : '') +
            'P' +
            (Y ? Y + 'Y' : '') +
            (M ? M + 'M' : '') +
            (D ? D + 'D' : '') +
            ((h || m || s) ? 'T' : '') +
            (h ? h + 'H' : '') +
            (m ? m + 'M' : '') +
            (s ? s + 'S' : '');
    }

    var duration_prototype__proto = Duration.prototype;

    duration_prototype__proto.abs            = duration_abs__abs;
    duration_prototype__proto.add            = duration_add_subtract__add;
    duration_prototype__proto.subtract       = duration_add_subtract__subtract;
    duration_prototype__proto.as             = as;
    duration_prototype__proto.asMilliseconds = asMilliseconds;
    duration_prototype__proto.asSeconds      = asSeconds;
    duration_prototype__proto.asMinutes      = asMinutes;
    duration_prototype__proto.asHours        = asHours;
    duration_prototype__proto.asDays         = asDays;
    duration_prototype__proto.asWeeks        = asWeeks;
    duration_prototype__proto.asMonths       = asMonths;
    duration_prototype__proto.asYears        = asYears;
    duration_prototype__proto.valueOf        = duration_as__valueOf;
    duration_prototype__proto._bubble        = bubble;
    duration_prototype__proto.get            = duration_get__get;
    duration_prototype__proto.milliseconds   = milliseconds;
    duration_prototype__proto.seconds        = seconds;
    duration_prototype__proto.minutes        = minutes;
    duration_prototype__proto.hours          = hours;
    duration_prototype__proto.days           = days;
    duration_prototype__proto.weeks          = weeks;
    duration_prototype__proto.months         = months;
    duration_prototype__proto.years          = years;
    duration_prototype__proto.humanize       = humanize;
    duration_prototype__proto.toISOString    = iso_string__toISOString;
    duration_prototype__proto.toString       = iso_string__toISOString;
    duration_prototype__proto.toJSON         = iso_string__toISOString;
    duration_prototype__proto.locale         = locale;
    duration_prototype__proto.localeData     = localeData;

    // Deprecations
    duration_prototype__proto.toIsoString = deprecate('toIsoString() is deprecated. Please use toISOString() instead (notice the capitals)', iso_string__toISOString);
    duration_prototype__proto.lang = lang;

    // Side effect imports

    // FORMATTING

    addFormatToken('X', 0, 0, 'unix');
    addFormatToken('x', 0, 0, 'valueOf');

    // PARSING

    addRegexToken('x', matchSigned);
    addRegexToken('X', matchTimestamp);
    addParseToken('X', function (input, array, config) {
        config._d = new Date(parseFloat(input, 10) * 1000);
    });
    addParseToken('x', function (input, array, config) {
        config._d = new Date(toInt(input));
    });

    // Side effect imports


    utils_hooks__hooks.version = '2.11.2';

    setHookCallback(local__createLocal);

    utils_hooks__hooks.fn                    = momentPrototype;
    utils_hooks__hooks.min                   = min;
    utils_hooks__hooks.max                   = max;
    utils_hooks__hooks.now                   = now;
    utils_hooks__hooks.utc                   = create_utc__createUTC;
    utils_hooks__hooks.unix                  = moment__createUnix;
    utils_hooks__hooks.months                = lists__listMonths;
    utils_hooks__hooks.isDate                = isDate;
    utils_hooks__hooks.locale                = locale_locales__getSetGlobalLocale;
    utils_hooks__hooks.invalid               = valid__createInvalid;
    utils_hooks__hooks.duration              = create__createDuration;
    utils_hooks__hooks.isMoment              = isMoment;
    utils_hooks__hooks.weekdays              = lists__listWeekdays;
    utils_hooks__hooks.parseZone             = moment__createInZone;
    utils_hooks__hooks.localeData            = locale_locales__getLocale;
    utils_hooks__hooks.isDuration            = isDuration;
    utils_hooks__hooks.monthsShort           = lists__listMonthsShort;
    utils_hooks__hooks.weekdaysMin           = lists__listWeekdaysMin;
    utils_hooks__hooks.defineLocale          = defineLocale;
    utils_hooks__hooks.weekdaysShort         = lists__listWeekdaysShort;
    utils_hooks__hooks.normalizeUnits        = normalizeUnits;
    utils_hooks__hooks.relativeTimeThreshold = duration_humanize__getSetRelativeTimeThreshold;
    utils_hooks__hooks.prototype             = momentPrototype;

    var _moment = utils_hooks__hooks;

    return _moment;

}));
},{}],31:[function(require,module,exports){
var memory = require("./memory");
var pluginService = require("./pluginService");
var sessionService = require("./sessionService");

/**
 * The API class interfaces with the core AI engine
 */
var api = {};

api.loadConfig = function (config) {
    memory.loadConfig(config);
};

api.startSession = function (userConfig) {
    return sessionService.newSession(userConfig);
};

api.getSession = function (sessionId) {
    return sessionService.getSession(sessionId);
};

api.registerPlugin = function (pluginConfig) {
    pluginService.register(pluginConfig);
};

api.getPlugins = function () {
    var plugins = pluginService.getPlugins();
    return pluginService.sanitizePlugins(plugins);
};

api.getPlugin = function (namespace) {
    var plugin = pluginService.getPlugin(namespace);
    return pluginService.sanitizePlugins(plugin);
};

api.updatePlugin = function (namespace, plugin) {
    return pluginService.updatePlugin(namespace, plugin);
};

module.exports = api;
},{"./memory":35,"./pluginService":44,"./sessionService":48}],32:[function(require,module,exports){
var nlp = require("./nlp/nlp");

var Expression = function (value, trigger, condition, expectations) {
    this.value = "";

    this.normalized = "";

    this.analysis = [];

    this.expectations = "";
    this.trigger = null;

    if (typeof value === "object" && value.hasOwnProperty("value")) {
        var intent = value;
        this.value = intent.value;
        this.expectations = intent.expectations || [];
        this.trigger = intent.trigger || null;
    } else {
        this.value = value || "";
        this.expectations = expectations || [];
        this.trigger = trigger || null;
    }
};

Expression.prototype.contains = function (v1, v2, v3) {
    var args = Array.prototype.slice.call(arguments);

    var value = this.value.toLowerCase();
    var normalized = this.normalized.toLowerCase();

    var i;
    var arg;
    for (i = 0; i < args.length; i++) {
        arg = args[i].toLowerCase();
        if (value.indexOf(arg) >= 0 || normalized.indexOf(arg) >= 0) {
            return true;
        }
    }

    return false;
};

Expression.prototype.process = function () {
    if (this.value) {
        var value = this.value;

        // Clean the value
        this.value = nlp.clean(value);

        // Set the normalized value
        this.normalized = nlp.normalize(this.value);

        this.analysis = nlp.analyse(this.normalized);
    }
    return this;
};

module.exports = Expression;
},{"./nlp/nlp":41}],33:[function(require,module,exports){
var nlp = require("./nlp/nlp");

var intentService = {};

intentService.matchInputToIntent = function (input, matchers) {
    var result = {
        intent: "",
        confidence: 0
    };

    var tokens = nlp.tokenize(input);

    var i;
    var matchResult;
    for (i = 0; i < matchers.length; i++) {
        matchResult = matchers[i].matchesInput(tokens);

        if (matchResult.amountMatched >= 0) {
            result.intent = matchers[i].intent;
            result.confidence = matchResult.amountMatched / tokens.length;
            result.namedWildcards = matchResult.namedWildcards || {};
            break;
        }
    }

    return result;
};

intentService.getInputs = function (matchers) {
    var result = [];

    var i;
    var phrases;
    var p;
    for (i = 0; i < matchers.length; i++) {
        phrases = matchers[i].getInputs();

        for (p = 0; p < phrases.length; p++) {
            result.push({
                value: phrases[p],
                trigger: matchers[i].intent,
                expectations: matchers[i].expectations
            });
        }
    }

    return result;
};

intentService.Matcher = function (input, intent, expectations) {
    this.intent = intent;
    this.expectations = expectations || [];
    this.tokens = intentService.Matcher.lex(input);
    this.tree = intentService.Matcher.buildParseTree(this.tokens.slice(0));
    this.specificity = intentService.Matcher.getSpecificity(this.tree);
    this.matchFunction = intentService.Matcher.parseMatchesFunction(this.tree);
    this.getInputsFunction = intentService.Matcher.parseGetInputs(this.tree);
};

intentService.Matcher.prototype.matchesInput = function (inputTokens) {
    var namedWildcards = {};
    var result = this.matchFunction(inputTokens, namedWildcards);
    return {
        amountMatched: result,
        namedWildcards: namedWildcards
    };
};

intentService.Matcher.prototype.getInputs = function () {
    var stringInputs = [];
    var inputs = [];
    this.getInputsFunction(inputs);

    var i;
    for (i = 0; i < inputs.length; i++) {
        stringInputs.push(inputs[i].join(" "));
    }

    return stringInputs;
};

intentService.Matcher.parseGetInputs = function (tree) {
    var getInputsFunction;
    var getInputsFunctions;

    var i;
    switch (tree.op) {
    case "start":
        getInputsFunctions = [];
        for (i = 0; i < tree.values.length; i++) {
            getInputsFunctions.push(intentService.Matcher.parseGetInputs(tree.values[i]));
        }

        getInputsFunction = function (inputs) {
            var i;

            if (inputs.length === 0) {
                inputs.push([]);
            }

            // Append each piece of text onto each input
            for (i = 0; i < this.length; i++) {
                this[i](inputs);
            }

        }.bind(getInputsFunctions);
        break;
    case "[":
        getInputsFunctions = [];
        for (i = 0; i < tree.values.length; i++) {
            getInputsFunctions.push(intentService.Matcher.parseGetInputs(tree.values[i]));
        }

        getInputsFunction = function (inputs) {
            var i;
            var a;

            // Keep the original set of inputs without the optional tree values and create a duplicate set of inputs that does have the tree values.
            // Merge the two together.
            var alternateInputs = intentService.Matcher.deepClone(inputs);
            for (i = 0; i < this.length; i++) {
                this[i](alternateInputs);
            }

            for (a = 0; a < alternateInputs.length; a++) {
                inputs.push(alternateInputs[a]);
            }

        }.bind(getInputsFunctions);
        break;
    case "(":
        var getInputsFunctionGroups = [];
        var innerArray = null;
        for (i = 0; i < tree.values.length; i++) {
            if (tree.values[i].op === "|") {
                innerArray = null;
            } else {
                if (innerArray === null) {
                    innerArray = [];
                    getInputsFunctionGroups.push(innerArray);
                }

                innerArray.push(intentService.Matcher.parseGetInputs(tree.values[i]));
            }
        }

        getInputsFunction = function (inputs) {
            var i;
            var g;
            var a;
            var alternatesToAdd = [];
            var alternateInputs;

            // For each alternate, create a duplicate set of inputs that contain the alternate tree
            for (g = 1; g < this.length; g++) {
                alternateInputs = intentService.Matcher.deepClone(inputs);
                alternatesToAdd.push(alternateInputs);

                for (i = 0; i < this[g].length; i++) {
                    this[g][i](alternateInputs);
                }
            }

            // for the first function, add onto the original set
            for (i = 0; i < this[0].length; i++) {
                this[0][i](inputs);
            }

            // Merge the sets together
            for (a = 0; a < alternatesToAdd.length; a++) {
                for (i = 0; i < alternatesToAdd[a].length; i++) {
                    inputs.push(alternatesToAdd[a][i]);
                }
            }

        }.bind(getInputsFunctionGroups);
        break;
    case "wildcard":
        getInputsFunction = function (inputs) {
            var i;
            for (i = 0; i < inputs.length; i++) {
                inputs[i].push("*");
            }
        };
        break;
    case "text":
        getInputsFunction = function (inputs) {
            var i;
            var a;

            // Append each piece of text onto each input
            for (a = 0; a < inputs.length; a++) {
                for (i = 0; i < this.length; i++) {
                    inputs[a].push(this[i]);
                }
            }

        }.bind(tree.values);
        break;
    }

    return getInputsFunction;
};

intentService.Matcher.parseMatchesFunction = function (tree) {
    var matchesFunction;

    var i;
    var matchFunctions;

    if (!tree) {
        return function () {return -1;};
    }

    switch (tree.op) {
    case "start":
        matchFunctions = [];
        for (i = 0; i < tree.values.length; i++) {
            matchFunctions.push(intentService.Matcher.parseMatchesFunction(tree.values[i]));
        }

        // Every tree value must return a good value
        matchesFunction = function (inputTokens, namedWildcards) {
            inputTokens = intentService.Matcher.deepClone(inputTokens); // Clone

            var i;
            var advance = 0;
            var a;
            for (i = 0; i < this.length; i++) {

                // If there are more tree values but there are no more input tokens, return -1 indicating the match failed.
                if (inputTokens.length === 0) {
                    if (tree.values[i].op === "wildcard" || tree.values[i].op === "[") {
                        continue;
                    }
                    return -1;
                }

                a = this[i](inputTokens, namedWildcards);

                // If the input did not match, return -1 indicating the required match failed.
                if (a === -1) {
                    return -1;
                }

                inputTokens.splice(0, a);
                advance += a;
            }

            return advance;
        }.bind(matchFunctions);
        break;
    case "[":
        matchFunctions = [];
        for (i = 0; i < tree.values.length; i++) {
            matchFunctions.push(intentService.Matcher.parseMatchesFunction(tree.values[i]));
        }

        // Tree values don't have to return a good value
        matchesFunction = function (inputTokens, namedWildcards) {
            inputTokens = intentService.Matcher.deepClone(inputTokens); // Clone

            var i;
            var advance = 0;
            var a;
            for (i = 0; i < this.length; i++) {
                a = this[i](inputTokens, namedWildcards);

                // If the input did not match, return 0 indicating the optional match was not found.
                if (a === -1) {
                    return 0;
                }

                inputTokens.splice(0, a);
                advance += a;
            }

            return advance;
        }.bind(matchFunctions);
        break;
    case "(":
        var matchFunctionGroups = [];
        var innerArray = null;
        for (i = 0; i < tree.values.length; i++) {
            if (tree.values[i].op === "|") {
                innerArray = null;
            } else {
                if (innerArray === null) {
                    innerArray = [];
                    matchFunctionGroups.push(innerArray);
                }

                innerArray.push(intentService.Matcher.parseMatchesFunction(tree.values[i]));
            }
        }

        matchesFunction = function (inputTokens, namedWildcards) {
            var i;
            var g;
            var a;
            var advance;
            var maxAdvance = 0;
            var tokensClone;

            // Find the alternate the matches the most of the input.
            for (g = 0; g < this.length; g++) {
                advance = 0;
                tokensClone = intentService.Matcher.deepClone(inputTokens);
                for (i = 0; i < this[g].length; i++) {
                    a = this[g][i](tokensClone, namedWildcards);

                    if (a === -1) {
                        advance = a;
                        break;
                    }

                    tokensClone.splice(0, a);
                    advance += a;
                }
                maxAdvance = Math.max(maxAdvance, advance);
            }

            // If no alternate matches the input, return -1.
            if (maxAdvance === 0) {
                return -1;
            }

            return maxAdvance;
        }.bind(matchFunctionGroups);
        break;
    case "wildcard":

        var binder = {
            wildcardName: tree.values[0]
        };

        // Need to reconstruct the entire tree with the parts that have been matched already removed from the tree
        // This allows using lookahead to find the least amount of text to match the wildcard
        var constructRemainingTree = function (parent, index) {

            // Reconstruct the parent tree
            var newParent = {
                op: parent.op,
                values: [],
                index: 0,
                getParent: null
            };

            var getParent = function () { return this; };

            // Add the remaining values in the parent tree
            if (parent.values.length > index + 1) {
                newParent.values = parent.values.slice(index + 1);

                var i;
                for (i = 0; i < newParent.values.length; i++) {
                    newParent.values[i].index = i;
                    newParent.values[i].getParent = getParent.bind(newParent);
                }
            }

            if (parent.getParent) {
                return constructRemainingTree(parent.getParent(), parent.index);
            } else {
                return newParent;
            }
        };

        if (tree.getParent) {
            var remainingTree = constructRemainingTree(tree.getParent(), tree.index);
            binder.matcher = intentService.Matcher.parseMatchesFunction(remainingTree);
        }

        matchesFunction = function (inputTokens, namedWildcards) {
            var i;

            var clone = intentService.Matcher.deepClone(inputTokens);

            if (this.matcher) {

                // Advance to the next token that matches
                for (i = 0; i < clone.length; i++) {
                    if (this.matcher && this.matcher(clone.slice(i), []) > 0) {
                        break;
                    }
                }
            } else {
                i = clone.length;
            }

            if (this.wildcardName && this.wildcardName !== "*" && i > 0) {
                namedWildcards[this.wildcardName] = inputTokens.slice(0, i).join(" ");
            }

            inputTokens.slice(i);

            return i;
        }.bind(binder);
        break;
    case "text":
        matchesFunction = function (inputTokens) {

            // If there is more text to match against than there is input, return -1 indicating match failed.
            if (this.length > inputTokens.length) {
                return -1;
            }

            var advance = 0;

            var i;
            for (i = 0; i < this.length; i++) {
                if (inputTokens[i].toLowerCase() === this[i].toLowerCase()) {
                    advance++;
                } else {

                    // If the text does not match, return -1.
                    return -1;
                }
            }

            return advance;
        }.bind(tree.values);
        break;
    }

    return matchesFunction;
};

intentService.Matcher.getSpecificity = function (tree) {
    var specificity = 0;

    var i;

    if (!tree) {
        return function () {return specificity;};
    }

    switch (tree.op) {
    case "start":

        // Add the point values of each tree value.
        for (i = 0; i < tree.values.length; i++) {
            specificity += intentService.Matcher.getSpecificity(tree.values[i]);
        }

        break;
    case "wildcard":
    case "[":

        // There are no points for optional matches or wildcards and no need to recurse into the structure
        break;
    case "(":

        // Find the lowest alternative points and add them to the total.
        var minSpec = null;
        var spec = 0;

        // Add each value together, once at a '|' or at the end get the minimum value between the sum and minSpec
        for (i = 0; i < tree.values.length; i++) {
            if (tree.values[i].op === "|") {
                if (minSpec === null) {
                    minSpec = spec;
                } else {
                    minSpec = Math.min(minSpec, spec);
                }
                spec = 0;
            } else {
                spec += intentService.Matcher.getSpecificity(tree.values[i]);
            }

            if (i === tree.values.length - 1) {
                if (minSpec === null) {
                    minSpec = spec;
                } else {
                    minSpec = Math.min(minSpec, spec);
                }
            }
        }

        if (minSpec !== null) {
            specificity += minSpec;
        }

        break;
    case "text":

        // Each word matched adds one point
        specificity += tree.values.length;
        break;
    }

    return specificity;
};

intentService.Matcher.lex = function (input) {
    var tokens = [];

    var i;
    var text = "";
    var namedWildcard = false;

    var checkAndAddTextToken = function () {
        if (text.length > 0) {
            if (text.trim().length > 0) {
                if (namedWildcard) {
                    tokens[tokens.length - 1].value = text.trim();
                    namedWildcard = false;
                } else {
                    tokens.push({type: "text", value: text.trim()});
                }
            }
            text = "";
        }
    };

    for (i = 0; i < input.length; i++) {

        switch (input[i]) {
        case "[":
        case "]":
        case "(":
        case ")":
        case "|":
            checkAndAddTextToken();
            tokens.push({ type: "op", value: input[i] });
            break;
        case "*":
            checkAndAddTextToken();
            tokens.push({ type: "wildcard", value: input[i] });
            break;
        default:
            if (namedWildcard === true) {
                if (input[i] === " ") {
                    checkAndAddTextToken();
                }
            } else if (tokens.length > 0 && tokens[tokens.length - 1].type === "wildcard" && tokens[tokens.length - 1].value === "*" && input[i] !== " " && text.length === 0) {
                namedWildcard = true;
            }

            text += input[i];
            break;
        }
    }

    checkAndAddTextToken();

    return tokens;
};

intentService.Matcher.buildParseTree = function (tokens, op) {
    var tree = {
        op: op || "start",
        values: [],
        index: 0,
        getParent: null
    };

    var token;
    var stopLoop = false;

    var getParent = function () {
        return this;
    };

    var index = 0;

    while (tokens.length > 0) {
        token = tokens.shift();

        if (token.type === "op") {

            switch (token.value) {
            case "[":
            case "(":
                var subTree = intentService.Matcher.buildParseTree(tokens, token.value);
                subTree.getParent = getParent.bind(tree);
                subTree.index = index++;
                tree.values.push(subTree);
                break;
            case "|":
                tree.values.push({op: "|", values: [], getParent: getParent.bind(tree), index: index++});
                break;
            case "]":
            case ")":
                stopLoop = true;
                break;
            default:
                tree.values.push({
                    op: "text",
                    values: token.value.split(" "),
                    getParent: getParent.bind(tree),
                    index: index++
                });
            }

        } else if (token.type === "wildcard") {
            tree.values.push({
                op: token.type,
                values: [token.value],
                getParent: getParent.bind(tree),
                index: index++
            });
        } else {
            tree.values.push({
                op: "text",
                values: token.value.split(" "),
                getParent: getParent.bind(tree),
                index: index++
            });
        }

        if (stopLoop) {
            break;
        }
    }

    return tree;
};

intentService.Matcher.deepClone = function (array) {
    return JSON.parse(JSON.stringify(array));
};

module.exports = intentService;
},{"./nlp/nlp":41}],34:[function(require,module,exports){
/**
 * The localStorage utility helps manage the storage and retrieval of registered application data.
 */
var storage = {
    localStorage: (typeof window !== "undefined") ? window.localStorage : null,
    cookie: (typeof document !== "undefined") ? document.cookie : null,
    memoryStorage: {},
    keys: {
        TOKEN: 'TOKEN',
        MEMORY: 'MEMORY'
    }
};

/**
 * Checks if the key is registered with the class.
 *
 * @param {String} key
 * @returns {Boolean} True if the key exists
 */
var keyExists = function (key) {
    return !!storage.keys[key];
};

/**
 * Appends a modifier to a key
 * @param {String} key
 * @param {String} [modifier]
 * @returns {String} The key with the modifier appended.
 */
var addKeyModifier = function (key, modifier) {
    if (modifier) {
        key += "_" + modifier;
    }
    return key;
};

/**
 * Stores data by key in local browser storage.
 *
 * @param {String} key The key to use as the local storage name. Must be a key found in localStorage.keys.
 * @param {String} value The string value to store.
 * @param {String} [keyModifier] An additional identifier on the key.
 */
storage.set = function (key, value, keyModifier) {
    if (keyExists(key)) {
        key = addKeyModifier(key, keyModifier);
        if (storage.supportsLocalStorage()) {
            storage.localStorage.setItem(key, value);
        } else if (storage.supportsCookies()) {
            var life = 60 * 60 * 24 * 5;
            var v = encodeURIComponent(value);
            storage.cookie = key + '=' + v + '; max-age=' + life + ';';
        } else {
            storage.memoryStorage[key] = value;
        }
    }
};

/**
 * Retrieves stored data by key.
 *
 * @param {String} key The key of the data to retrieve. Must be a key found in localStorage.keys.
 * @param {String} [keyModifier] An additional identifier on the key.
 * @return {String} The string value stored.
 */
storage.get = function (key, keyModifier) {
    var value = "";

    if (keyExists(key)) {
        key = addKeyModifier(key, keyModifier);
        if (storage.supportsLocalStorage()) {
            value = storage.localStorage.getItem(key) || "";
        } else if (storage.supportsCookies()) {
            var regexp = new RegExp(key + "=([^;]+)", "g");
            var c = regexp.exec(storage.cookie);

            if (c) {
                value = decodeURIComponent(c[1]);
            }
        } else {
            value = storage.memoryStorage[key] || "";
        }
    }

    return value;
};

/**
 * Removes stored data by key.
 *
 * @param {String} key The key of the data to remove. Must be a key found in localStorage.keys.
 * @param {String} [keyModifier] An additional identifier on the key.
 */
storage.remove = function (key, keyModifier) {
    if (keyExists(key)) {
        key = addKeyModifier(key, keyModifier);
        if (storage.supportsLocalStorage()) {
            storage.localStorage.removeItem(key);
        } else if (storage.supportsCookies()) {
            storage.cookie = key + '=; max-age=0;';
        } else {
            delete storage.memoryStorage[key];
        }
    }
};

/**
 * Checks if the platform supports html5 local storage.
 */
storage.supportsLocalStorage = function () {
    try {
        return window && 'localStorage' in window && window.localStorage !== null;
    } catch (e) {
        return false;
    }
};

/**
 * Checks if the platform supports cookies.
 */
storage.supportsCookies = function () {
    try {
        return document && 'cookie' in document;
    } catch (e) {
        return false;
    }
};

module.exports = storage;
},{}],35:[function(require,module,exports){
var localStorage = require("./localStorage");
var utils = require("./utils");

var memory = {
    file: 'memory.json',
    storage: {}
};

var init = function () {
    var mem = localStorage.get(localStorage.keys.MEMORY);
    memory.storage = mem ? JSON.parse(mem) : {};
};

var commit = function () {
    localStorage.set(localStorage.keys.MEMORY, JSON.stringify(memory.storage));
};

memory.loadConfig = function (config) {
    this.storage = utils.extend(config, this.storage);
    commit();
};

memory.getShortTerm = function (memoryBank, name) {
    if (name && memoryBank[name]) {
        return memoryBank[name];
    }

    console.log('Memory Warning: No short term memory found by name: ' + name);
    return null;
};

memory.setShortTerm = function (memoryBank, name, value) {
    if (!name) {
        console.log('Memory Error: Cannot store short term memory without name.');
        return;
    }

    if (value === null || value === undefined) {
        delete memoryBank[name];
    } else {
        memoryBank[name] = value;
    }
};

memory.get = function (username) {
    this.storage[username] = this.storage[username] || {};
    return this.storage[username];
};

memory.set = function (username, memories) {
    this.storage[username] = memories;
    commit();
};

memory.getPluginSettings = function (pluginNamespace) {
    this.storage.pluginSettings = this.storage.pluginSettings || {};
    return this.storage.pluginSettings[pluginNamespace] || {};
};

memory.setPluginSettings = function (pluginNamespace, settings) {
    this.storage.pluginSettings = this.storage.pluginSettings || {};
    this.storage.pluginSettings[pluginNamespace] = settings;
    commit();
};

memory.isEnabledPlugin = function (pluginNamespace) {
    this.storage.enabledPlugins = this.storage.enabledPlugins || {};
    return this.storage.enabledPlugins[pluginNamespace] === true;
};

memory.setEnabledPlugin = function (pluginNamespace, enabled) {
    this.storage.enabledPlugins = this.storage.enabledPlugins || {};
    this.storage.enabledPlugins[pluginNamespace] = enabled;
    commit();
};

init();

module.exports = memory;
},{"./localStorage":34,"./utils":50}],36:[function(require,module,exports){
var entityExtractor = {};

entityExtractor.Entity = function (raw, type, value, source, confidence) {
    this.type = type;
    this.raw = raw;
    this.template = source.replace(raw, "{{" + type + "}}");
    this.start = source.indexOf(raw);
    this.end = source.indexOf(raw) + raw.length;
    this.value = value;
    this.confidence = confidence;
};

entityExtractor.extract = function (string, type, regexp, getValue) {
    var entities = [];
    var originalString = string;
    var match = string.trim().match(regexp);
    var entity;
    var value;

    while (match) {
        value = getValue(match[0]);
        entity = new entityExtractor.Entity(match[0], type, value, originalString, 1);
        entities.push(entity);
        string = string.replace(match[0], "");
        match = string.match(regexp);
    }

    return entities;
};

module.exports = entityExtractor;
},{}],37:[function(require,module,exports){
var expressions = {};

expressions.timePeriods = /(millennium|millennia|centuries|century|decades|decade|years|year|months|month|weeks|week|days|day|hours|hour|minutes|minute|seconds|second)/;
expressions.daysOfWeek = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/;
expressions.monthOfYear = /(january|february|march|april|may|june|july|august|september|october|november|december)/;
expressions.timeOfDay = /(morning|evening|afternoon|night|noon|dawn|dusk|sunrise|sunset|midnight|midday|mid\-day)/;
expressions.timeOfDayInThe = /(morning|evening|afternoon|night)/;
expressions.timeOfDayAt = /(night|noon|dawn|dusk|sunrise|sunset|midnight|midday|mid\-day)/;

expressions.url = /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&\/=]*)/i;

module.exports = expressions;
},{}],38:[function(require,module,exports){
var moment = require("moment");

var entityExtractor = require('../entityExtractor');
var expressions = require("../expressions");

var datetimeNer = {};

datetimeNer.relativeTimeOfDay = new RegExp("(((in the )?" + expressions.timeOfDayInThe.source + ")|(((at|around) )?" + expressions.timeOfDayAt.source + ")|(the " + expressions.timeOfDayInThe.source + " of))", "i");
datetimeNer.relativeTime = new RegExp("((right now)|(" + datetimeNer.relativeTimeOfDay.source + " )?(today|yesterday|tomorrow|tonight)( " + datetimeNer.relativeTimeOfDay.source + ")?|" + expressions.daysOfWeek.source + "( " + datetimeNer.relativeTimeOfDay.source + ")?|(datetimeNer " + expressions.timeOfDayInThe.source + ")|((" + datetimeNer.relativeTimeOfDay.source + " )?datetimeNer " + expressions.daysOfWeek.source + "( " + datetimeNer.relativeTimeOfDay.source + ")?)|((datetimeNer|next|last) (" + expressions.daysOfWeek.source + "|" + expressions.timePeriods.source + "|" + expressions.monthOfYear.source + "))|(in the " + expressions.timeOfDayInThe.source + ")|((at|around) " + expressions.timeOfDayAt.source + "))", "i");
datetimeNer.timeLength = new RegExp("(\\d+|a|an) " + expressions.timePeriods.source, "i");
datetimeNer.timeFromNow = new RegExp("((in " + datetimeNer.timeLength.source + " from (now|" + datetimeNer.relativeTime.source + "))|(in " + datetimeNer.timeLength.source + ")|(" + datetimeNer.timeLength.source + " from (now|" + datetimeNer.relativeTime.source + ")))", "i");
datetimeNer.timeAgo = new RegExp("(" + datetimeNer.timeLength.source + " ago( " + datetimeNer.relativeTime.source + ")?)", "i");

/**
 * Used to extract the entities from an expression
 * @param {String} normalized input
 * @returns {entityExtractor.Entity[]}
 */
datetimeNer.extract = function (normalized) {
    var entities = [];
    entities = entities.concat(entityExtractor.extract(normalized, 'datetime.datetime', new RegExp("(" + this.timeFromNow.source + "|" + this.timeAgo.source + "|" + this.relativeTime.source + ")", "i"), datetimeNer.extractDatetime.bind(this)));
    entities = entities.concat(entityExtractor.extract(normalized, 'datetime.duration', this.timeLength, extractDuration.bind(this)));
    return entities;
};

/**
 * Extracts the datetime value from a string
 * @param {String} string Containing the value to extract
 * @returns {String} ISO8601 Date
 */
datetimeNer.extractDatetime = function (string) {
    var date = moment();

    if (string.match(/tonight/i)) {
        date.hour(20); // 8pm
    } else if (string.match(/tomorrow/i)) {
        date.add(1, 'd');
    } else if (string.match(/yesterday/i)) {
        date.subtract(1, 'd');
    }

    var relative = string.match(new RegExp("((on|this (coming)?|(this past)|last|next) (" + expressions.daysOfWeek.source + "|" + expressions.timePeriods.source + "|" + expressions.monthOfYear.source + ")|(" + expressions.daysOfWeek.source + "|" + expressions.monthOfYear.source + "))", "i"));
    if (relative) {
        var past = relative[0].match(/(last|(this past))/i);
        var dayOfWeek = relative[0].match(new RegExp(expressions.daysOfWeek.source, "i"));
        var monthOfYear = relative[0].match(new RegExp(expressions.monthOfYear.source, "i"));
        var timePeriod = relative[0].match(new RegExp(expressions.timePeriods.source, "i"));

        if (dayOfWeek) {
            var currentDay = date.day();
            var setDay = currentDay;
            switch (dayOfWeek[0].toLowerCase()) {
            case 'monday':
                setDay = 1;
                break;
            case 'tuesday':
                setDay = 2;
                break;
            case 'wednesday':
                setDay = 3;
                break;
            case 'thursday':
                setDay = 4;
                break;
            case 'friday':
                setDay = 5;
                break;
            case 'saturday':
                setDay = 6;
                break;
            case 'sunday':
                setDay = 0;
                break;
            }

            if (past && setDay >= currentDay) {
                setDay -= 7;
            }
            if (!past && setDay < currentDay) {
                setDay += 7;
            }

            date.day(setDay);
        }

        if (monthOfYear) {
            var currentMonth = date.month();
            var setMonth = currentMonth;
            switch (monthOfYear[0].toLowerCase()) {
            case 'january':
                setMonth = 0;
                break;
            case 'february':
                setMonth = 1;
                break;
            case 'march':
                setMonth = 2;
                break;
            case 'april':
                setMonth = 3;
                break;
            case 'may':
                setMonth = 4;
                break;
            case 'june':
                setMonth = 5;
                break;
            case 'july':
                setMonth = 6;
                break;
            case 'august':
                setMonth = 7;
                break;
            case 'september':
                setMonth = 8;
                break;
            case 'october':
                setMonth = 9;
                break;
            case 'november':
                setMonth = 10;
                break;
            case 'december':
                setMonth = 11;
                break;
            }

            if (past && setMonth >= currentMonth) {
                date.subtract(1, "y");
            }
            if (!past && setMonth < currentMonth) {
                date.add(1, "y");
            }

            date.month(setMonth);
        }

        if (timePeriod) {
            switch (timePeriod[0].toLowerCase()) {
            case 'week':
                date = (past) ? date.subtract(1, "w") : date.add(1, "w");
                break;
            case 'month':
                date = (past) ? date.subtract(1, "M") : date.add(1, "M");
                break;
            case 'year':
                date = (past) ? date.subtract(1, "y") : date.add(1, "y");
                break;
            }
        }
    }

    var timeOfDay = string.match(new RegExp(expressions.timeOfDay.source, 'i'));
    if (timeOfDay) {
        switch (timeOfDay[0].toLowerCase()) {
        case 'dawn':
            date.hour(6); // 6am
            break;
        case 'morning':
        case 'sunrise':
            date.hour(7); // 7am
            break;
        case 'noon':
        case 'midday':
        case 'mid-day':
            date.hour(12); // 12pm
            break;
        case 'afternoon':
            date.hour(14); // 2pm
            break;
        case 'evening':
        case 'sunset':
            date.hour(18); // 6pm
            break;
        case 'dusk':
            date.hour(19); // 7pm
            break;
        case 'night':
            date.hour(20); // 8pm
            break;
        case 'midnight':
            date.hour(23).minute(59); // 11:59pm
            break;
        }
    }

    var fromNow = string.match(new RegExp(this.timeFromNow.source, 'i'));
    var ago = string.match(new RegExp(this.timeAgo.source, 'i'));
    if (fromNow || ago) {
        var number;
        if ((fromNow && fromNow[0].match(/^(a|an)/)) || (ago && ago[0].match(/^(a|an)/))) {
            number = 1;
        } else if (fromNow) {
            number = parseInt(fromNow[0].match(/\d+/)[0], 10);
        } else {
            number = parseInt(ago[0].match(/\d+/)[0], 10);
        }
        if (number) {
            var extractedTimePeriod = string.match(expressions.timePeriods);
            switch (extractedTimePeriod[0]) {
            case 'second':
            case 'seconds':
                date = (fromNow) ? date.add(number, 's') : date.subtract(number, 's');
                break;
            case 'minute':
            case 'minutes':
                date = (fromNow) ? date.add(number, 'm') : date.subtract(number, 'm');
                break;
            case 'hour':
            case 'hours':
                date = (fromNow) ? date.add(number, 'h') : date.subtract(number, 'h');
                break;
            case 'day':
            case 'days':
                date = (fromNow) ? date.add(number, 'd') : date.subtract(number, 'd');
                break;
            case 'week':
            case 'weeks':
                date = (fromNow) ? date.add(number, 'w') : date.subtract(number, 'w');
                break;
            case 'month':
            case 'months':
                date = (fromNow) ? date.add(number, 'M') : date.subtract(number, 'M');
                break;
            case 'year':
            case 'years':
                date = (fromNow) ? date.add(number, 'y') : date.subtract(number, 'y');
                break;
            case 'decade':
            case 'decades':
                date = (fromNow) ? date.add(number * 10, 'y') : date.subtract(number * 10, 'y');
                break;
            case 'century':
            case 'centuries':
                date = (fromNow) ? date.add(number * 100, 'y') : date.subtract(number * 100, 'y');
                break;
            case 'millennium':
            case 'millennia':
                date = (fromNow) ? date.add(number * 1000, 'y') : date.subtract(number * 1000, 'y');
                break;
            }
        }
    }

    return date.format();
};

/**
 * Extract a length of time in seconds from a string
 * @param {string} string
 * @returns {number} Seconds
 */
var extractDuration = function (string) {
    var seconds = 0;
    var number = parseInt(string.match(/\d+/)[0], 10);

    if (number) {
        var extractedTimePeriod = string.match(expressions.timePeriods);
        if (extractedTimePeriod) {
            switch (extractedTimePeriod[0]) {
            case 'second':
            case 'seconds':
                seconds = number;
                break;
            case 'minute':
            case 'minutes':
                seconds = number * 60;
                break;
            case 'hour':
            case 'hours':
                seconds = number * 60 * 60;
                break;
            case 'day':
            case 'days':
                seconds = number * 60 * 60 * 24;
                break;
            case 'week':
            case 'weeks':
                seconds = number * 60 * 60 * 24 * 7;
                break;
            case 'month':
            case 'months':
                seconds = Math.round(number * 60 * 60 * 24 * 30.42);
                break;
            case 'year':
            case 'years':
                seconds = number * 60 * 60 * 24 * 365;
                break;
            case 'decade':
            case 'decades':
                seconds = number * 60 * 60 * 24 * 365 * 10;
                break;
            case 'century':
            case 'centuries':
                seconds = number * 60 * 60 * 24 * 365 * 100;
                break;
            case 'millennium':
            case 'millennia':
                seconds = number * 60 * 60 * 24 * 365 * 1000;
                break;
            }
        }
    }

    return seconds;
};

module.exports = datetimeNer;
},{"../entityExtractor":36,"../expressions":37,"moment":30}],39:[function(require,module,exports){
var moment = require("moment");

var entityExtractor = require('../entityExtractor');
var expressions = require("../expressions");

var personNer = {};

personNer.timeLength = new RegExp("\\d+ " + expressions.timePeriods.source);
personNer.age = new RegExp("(" + personNer.timeLength.source + " (old|young))");

/**
 * Used to extract the entities from an expression
 * @param {String} normalized input
 * @param {{analysis: []}} expression additional NLP data
 * @returns {{type: String, start: Number, end: Number, value: *}[]}
 */
personNer.extract = function (normalized, expression) {
    var entities = [];
    entities = entities.concat(entityExtractor.extract(normalized, 'person.age', new RegExp(this.age.source, 'i'), extractBirthday.bind(this)));
    entities = entities.concat(extractName.bind(this)(normalized, expression.analysis));
    return entities;
};

/**
 * Extracts the birthday from the age value from a string
 * @param {String} string Containing the value to extract
 * @returns {String} "4 years old"
 */
var extractBirthday = function (string) {
    var date = moment();
    var number = parseInt(string.match(/\d+/)[0], 10);

    if (number) {
        var extractedTimePeriod = string.match(expressions.timePeriods);
        if (extractedTimePeriod) {
            switch (extractedTimePeriod[0]) {
            case 'second':
            case 'seconds':
                date.subtract(number, 's');
                break;
            case 'minute':
            case 'minutes':
                date.subtract(number, 'm');
                break;
            case 'hour':
            case 'hours':
                date.subtract(number, 'h');
                break;
            case 'day':
            case 'days':
                date.subtract(number, 'd');
                break;
            case 'week':
            case 'weeks':
                date.subtract(number, 'w');
                break;
            case 'month':
            case 'months':
                date.subtract(number, 'M');
                break;
            case 'year':
            case 'years':
                date.subtract(number, 'y');
                break;
            case 'decade':
            case 'decades':
                date.subtract(number * 10, 'y');
                break;
            case 'century':
            case 'centuries':
                date.subtract(number * 100, 'y');
                break;
            case 'millennium':
            case 'millennia':
                date.subtract(number * 1000, 'y');
                break;
            }
        }
    }

    return date.format();
};

/**
 * Extracts a person's name value from a string
 * @param {String} string Containing the value to extract
 * @param {Array} analysis
 * @returns {entityExtractor.Entity[]} Entities
 */
var extractName = function (string, analysis) {
    var entities = [];

    var i;
    var r;
    var name;
    if (analysis[0]) {
        for (i = 0; i < analysis[0].tokens.length;) {
            r = i;
            name = null;

            while (analysis[0].tokens[r] && (analysis[0].tokens[r].pos === "NNP" || analysis[0].tokens[r].pos === "JJ")) {
                if (name) {
                    name += " " + analysis[0].tokens[r].raw;
                } else {
                    name = analysis[0].tokens[r].raw;
                }
                r++;
            }

            if (name) {
                entities.push(new entityExtractor.Entity(name, 'person.name', name, string, 1));
            }

            i = r + 1;
        }

        for (i = 0; i < analysis[0].tokens.length;) {
            r = i;
            name = null;

            var firstChar = analysis[0].tokens[r].raw.charAt(0);
            while (analysis[0].tokens[r] && analysis[0].tokens[r].pos === "N" && firstChar === firstChar.toUpperCase()) {
                if (name) {
                    name += " " + analysis[0].tokens[r].raw;
                } else {
                    name = analysis[0].tokens[r].raw;
                }
                r++;
            }

            if (name) {
                entities.push(new entityExtractor.Entity(name, 'person.name', name, string, 0.5));
            }

            i = r + 1;
        }
    }

    return entities;
};

module.exports = personNer;
},{"../entityExtractor":36,"../expressions":37,"moment":30}],40:[function(require,module,exports){
var entityExtractor = require('../entityExtractor');
var expressions = require("../expressions");

var urlNer = {};

/**
 * Used to extract the entities from an expression
 * @param {String} normalized input
 * @returns {{type: String, start: Number, end: Number, value: *}[]}
 */
urlNer.extract = function (normalized) {
    var entities = [];
    entities = entities.concat(entityExtractor.extract(normalized, 'url.url', expressions.url, extractUrl.bind(this)));
    return entities;
};

/**
 * Extracts a url value from a string
 * @param {String} string Containing the value to extract
 * @returns {String} The url
 */
var extractUrl = function (string) {
    return string;
};

module.exports = urlNer;
},{"../entityExtractor":36,"../expressions":37}],41:[function(require,module,exports){
var compendium = require("compendium-js");
var humanizeDuration = require("humanize-duration");

var normalizer = require("./normalizer");
var datetimeNer = require("./ner/datetime");
var personNer = require("./ner/person");
var urlNer = require("./ner/url");

var nlp = {};

nlp.clean = function (input) {
    return normalizer.clean(input);
};

nlp.normalize = function (input) {
    return normalizer.normalize(input);
};

nlp.tokenize = function (input) {
    return input.split(/[\s.,!?]+/);
};

nlp.ner = function (normalized, expression) {
    var entities = datetimeNer.extract(normalized);
    entities = entities.concat(personNer.extract(normalized, expression));
    entities = entities.concat(urlNer.extract(normalized));
    return entities;
};

nlp.shuffle = function (array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
};

nlp.analyse = function (input) {
    return compendium.analyse(input, 'en');
};

nlp.humanizeDuration = function (seconds) {
    return humanizeDuration(seconds * 1000, { largest: 2, round: true, conjunction: ' and ', serialComma: false });
};

module.exports = nlp;
},{"./ner/datetime":38,"./ner/person":39,"./ner/url":40,"./normalizer":42,"compendium-js":27,"humanize-duration":28}],42:[function(require,module,exports){
var numberParser = require("./numberParser");

var normalizer = {
    _substitutions: [],
    _corrections: [],
    _replacements: []
};

normalizer.clean = function (input) {

    input = this.cleanChars(input);
    input = this.applyCorrections(input);
    input = this.applyReplacements(input);

    return input.trim();
};

normalizer.normalize = function (input) {

    input = this.clean(input);
    input = this.applySubstitutions(input);
    input = this.replaceWrittenTime(input);
    input = this.replaceWrittenNumbers(input);

    return input;
};

normalizer.cleanChars = function (input) {

    input = input.replace(new RegExp("\t", "g"), " ");
    input = input.replace(/\s+/g, " ");
    input = input.replace(/ ,/g, ",");
    input = input.replace(/ \?/g, "?");
    input = input.replace(/ \./g, ".");
    input = input.replace(/ ;/g, ";");
    input = input.replace(/(’|‘)/g, "'");
    input = input.replace(/(“|”)/g, '"');
    input = input.replace(/(–|—)/g, "—");
    input = input.replace(/[^\x00-\x7F]/g, "");
    input = input.replace(/\d,\d/g, function (v) {
        return v.replace(",", "");
    });

    return input.trim();
};

normalizer.replaceWrittenTime = function (input) {
    var writtenNumberBase = /(one|two|three|four|five|six|seven|eight|nine)/;
    var writtenNumberBaseTeen = /(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)/;
    var writtenTimeMultiple = /(twenty|thirty|forty|fifty)/;
    var writtenTimeMultipleBase = new RegExp(writtenTimeMultiple.source + "( |-)" + writtenNumberBase.source);
    var writtenTimeHour = new RegExp("(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)", "i");
    var writtenTime = new RegExp("(" + writtenTimeHour.source + " (((oh|o|o') " + writtenNumberBase.source + ")|" + writtenTimeMultipleBase.source + "|" + writtenTimeMultiple.source + "|" + writtenNumberBaseTeen.source + "))");

    var toExtract = new RegExp("(" + writtenTime.source + ")", "i");
    var regex = new RegExp("(^|[^\\w'-])" + toExtract.source + "([^\\w'-]|$)", "i");
    var match = input.match(regex);

    while (match) {
        var extracted = match[0].match(toExtract)[0];
        var clone = extracted;
        var writtenHour = clone.match(writtenTimeHour);
        var hour = numberParser.parse(writtenHour[0]);

        clone = clone.replace(writtenHour[0], hour);
        var writtenMinute = clone.match(new RegExp("(" + writtenNumberBase.source + "|" + writtenTimeMultipleBase.source + "|" + writtenTimeMultiple.source + "|" + writtenNumberBaseTeen.source + ")", "i"));
        var minute = numberParser.parse(writtenMinute[0]);
        if (minute < 10) {
            minute = "0" + minute;
        }

        input = input.replace(extracted, hour + ":" + minute);
        match = input.match(regex);
    }

    return input;
};

normalizer.replaceWrittenNumbers = function (input) {
    var writtenNumberUnit = /((hundred thousand)|(hundred grand)|(hundred million)|(hundred billion)|(hundred trillion)|(thousand million)|(thousand billion)|(thousand trillion)|(million trillion)|(million billion)|(million trillion)|(billion trillion)|hundred|thousand|grand|million|billion|trillion)/;
    var writtenNumberBase = /(one|two|three|four|five|six|seven|eight|nine)/;
    var writtenNumberBaseTeen = /(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)/;
    var writtenNumberMultiple = /(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)/;
    var writtenNumberMultipleBase = new RegExp(writtenNumberMultiple.source + "( |-)" + writtenNumberBase.source);
    var writtenNumberSingle = new RegExp("((" + writtenNumberMultipleBase.source + "|" + writtenNumberMultiple.source + "|" + writtenNumberBaseTeen.source + "|" + writtenNumberBase.source + ")( " + writtenNumberUnit.source + ")?)");
    var writtenNumber = new RegExp("((" + writtenNumberSingle.source + ")( (and )?" + writtenNumberSingle.source + ")*)");

    var toExtract = new RegExp("(((a|\\d+) " + writtenNumberUnit.source + ")|" + writtenNumber.source + ")", "i");
    var regex = new RegExp("(^|[^\\w'-])" + toExtract.source + "([^\\w'-]|$)", "i");
    var match = input.match(regex);

    while (match) {
        var extracted = match[0].match(toExtract);
        var number = numberParser.parse(extracted[0]);
        input = input.replace(extracted[0], number);
        match = input.match(regex);
    }

    return input;
};

normalizer.applySubstitutions = function (input) {
    var i;
    for (i = 0; i < this._substitutions.length; i++) {
        input = this._substitutions[i].execute(input);
    }
    return input;
};

normalizer.applyCorrections = function (input) {
    var i;
    for (i = 0; i < this._corrections.length; i++) {
        input = this._corrections[i].execute(input);
    }
    return input;
};

normalizer.applyReplacements = function (input) {
    var i;
    for (i = 0; i < this._replacements.length; i++) {
        input = this._replacements[i].execute(input);
    }
    return input;
};

normalizer._Replacer = function (key, value) {
    key = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    var regex = new RegExp("(^|[^\\w'-])(" + key + ")([^\\w'-]|$)", "gi");
    this.execute = function (input) {
        return input.replace(regex, function (v, b1, match, b2) {
            var replacement = v;

            if (match) {
                replacement = value;
                var matchIsUppercase = match[0] === match[0].toUpperCase();
                var replacementIsUppercase = replacement[0] === replacement[0].toUpperCase();

                if (!replacementIsUppercase && matchIsUppercase) {
                    replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
                }

                replacement = b1 + replacement + b2;
            }

            return replacement;
        });
    };
};

normalizer._init = function () {
    this._substitutions = [];
    this._replacements = [];
    this._corrections = [];

    var self = this;

    var key;

    for (key in substitutions) {
        if (substitutions.hasOwnProperty(key)) {
            self._substitutions.push(new self._Replacer(key, substitutions[key]));
        }
    }
    for (key in replacements) {
        if (replacements.hasOwnProperty(key)) {
            self._replacements.push(new self._Replacer(key, replacements[key]));
        }
    }
    for (key in corrections) {
        if (corrections.hasOwnProperty(key)) {
            self._corrections.push(new self._Replacer(key, corrections[key]));
        }
    }
};

var substitutions = {
    "aren't": "are not",
    "can't": "can not",
    "could've": "could have",
    "couldn't": "could not",
    "didn't": "did not",
    "doesn't": "does not",
    "don't": "do not",
    "everybody's": "everybody is",
    "everything's": "everything is",
    "hadn't": "had not",
    "hasn't": "has not",
    "haven't": "have not",
    "he'd": "he would",
    "he'll": "he will",
    "he's": "he is",
    "here's": "here is",
    "how'd": "how did",
    "how's": "how is",
    "how've": "how have",
    "I'd": "I would",
    "i'd": "I would",
    "i'll": "I will",
    "I'll": "I will",
    "i'm": "I am",
    "I'm": "I am",
    "i've": "I have",
    "I've": "I have",
    "isn't": "is not",
    "it'll": "it will",
    "it's": "it is",
    "let's": "let us",
    "nobody's": "nobody is",
    "nothing's": "nothing is",
    "she'd": "she would",
    "she'll": "she will",
    "she's": "she is",
    "should've": "should have",
    "shouldn't": "should not",
    "somebody's": "somebody is",
    "someone's": "someone is",
    "something's": "something is",
    "that'd": "that would",
    "that'll": "that will",
    "that's": "that is",
    "there'd": "there would",
    "there'll": "there will",
    "there're": "there are",
    "there's": "there is",
    "they'd": "they would",
    "they'll": "they will",
    "they're": "they are",
    "they've": "they have",
    "this'll": "this will",
    "wasn't": "was not",
    "we'd": "we would",
    "we'll": "we will",
    "we're": "we are",
    "we've": "we have",
    "weren't": "were not",
    "what'd": "what did",
    "what'll": "what will",
    "what're": "what are",
    "what've": "what have",
    "what's": "what is",
    "when's": "when is",
    "where'd": "where did",
    "where've": "where have",
    "where's": "where is",
    "who'd": "who would",
    "who'll": "who will",
    "who's": "who is",
    "who've": "who have",
    "why'd": "why did",
    "why's": "why is",
    "won't": "will not",
    "would've": "would have",
    "wouldn't": "would not",
    "you'd": "you would",
    "you'll": "you will",
    "you're": "you are",
    "you've": "you have",
    "a.i.": "artificial intelligence",
    "a bacteria": "a bacterium",
    "a bf": "a boyfriend",
    "a bit of": "some",
    "a consortia": "a consortium",
    "a criteria": "a criterion",
    "a dab of": "some",
    "a dash of": "some",
    "a fungi": "a fungus",
    "a hint of": "some",
    "a kind of": "a",
    "a larvae": "a larva",
    "a lose": "a loss",
    "a paparazzi": "a paparazzo",
    "a parentheses": "a parenthesis",
    "a phenomena": "a phenomenon",
    "a protozoa": "a protozoon",
    "a set back": "a setback",
    "a small amount of": "some",
    "a sort of": "a",
    "a touch of": "some",
    "a type of": "a",
    "a vertebrae": "a vertebra",
    "a women": "a woman",
    "ABM missile": "ABM",
    "ABS system": "ABS",
    "acid test": "important test",
    "active weather": "weather",
    "add together": "combine",
    "advance forward": "forward",
    "advance scouting": "scouting",
    "advance warning": "warning",
    "affirmative yes": "yes",
    "affluent rich": "rich",
    "ahead of schedule": "early",
    "aid and abet": "abet",
    "albeit": "although it is",
    "album comprised of": "album composed of",
    "all for not": "all for naught",
    "alma matter": "alma mater",
    "almost all": "most",
    "almost all the time": "all the time",
    "along the lines of": "resembling",
    "along time": "a long time",
    "am in the morning": "am",
    "american": "American",
    "AMOCO Oil Co.": "AMOCO",
    "an adequate number of": "enough",
    "an affect": "an effect",
    "an alumni": "an alumnus",
    "and etc.": "etc.",
    "and so fourth": "and so forth",
    "anonymous stranger": "stranger",
    "any more": "anymore",
    "appeared to be": "was",
    "apple iphone": "iPhone",
    "Apple iPhone": "iPhone",
    "are lead by": "are led by",
    "as black as pitch": "black",
    "as blind as a bat": "blind",
    "as busy as a beaver": "busy",
    "as busy as a bee": "busy",
    "as cool as a cucumber": "calm",
    "as dead as a doornail": "dead",
    "as easy as pie": "easy",
    "as gentle as a lamb": "gentle",
    "as happy as a lark": "happy",
    "as heavy as lead": "heavy",
    "as pretty as a picture": "pretty",
    "as quick as a flash": "quick",
    "as quick as a wink": "quick",
    "as sick as a dog": "sick",
    "as slow as molasses": "slow",
    "as smart as a whip": "smart",
    "as straight as an arrow": "straight",
    "as strong as an ox": "strong",
    "as thin as a rail": "thin",
    "as white as a sheet": "white",
    "as wise as an owl": "smart",
    "asap": "as soon as possible",
    "ascend up": "ascend",
    "assuming that": "if",
    "at all times": "always",
    "at the current instant": "now",
    "at the current moment": "now",
    "at the end of": "after",
    "at the present time": "now",
    "at this instant": "now",
    "at this moment": "now",
    "at this point in time": "at this time",
    "ATM machine": "ATM",
    "autobiography of her life": "autobiography",
    "autobiography of his life": "autobiography",
    "autobiography of my life": "autobiography",
    "autobiography of your life": "autobiography",
    "automatic ATM machine": "ATM",
    "back and fourth": "back and forth",
    "back in forth": "back and forth",
    "bad evil": "evil",
    "baited breath": "bated breath",
    "band comprised of": "band composed of",
    "bare essentials": "essentials",
    "basic essentials": "essentials",
    "basic fundamentals": "fundamentals",
    "be ware": "beware",
    "because of the fact that": "because",
    "began to be": "was",
    "begin to be": "are",
    "begins to be": "is",
    "betcha": "bet you",
    "better then": "better than",
    "biography of her life": "biography",
    "biography of his life": "biography",
    "biography of my life": "biography",
    "biography of your life": "biography",
    "blood hemorrhage": "hemorrhage",
    "boat marina": "marina",
    "bout": "about",
    "bro": "brother",
    "brother in law": "brother-in-law",
    "brothers in law": "brothers-in-law",
    "brr": "it is cold",
    "by means of": "through",
    "by virtue of the fact that": "because",
    "byt he": "by the",
    "came to an agreement": "agreed",
    "can you tell me": "tell me",
    "cant": "can not",
    "Capetown": "Cape Town",
    "carry no": "not carry",
    "carry out an evaluation of": "evaluate",
    "cease and desist": "cease",
    "cellphone": "cell phone",
    "Century": "century",
    "chomping at the bit": "champing at the bit",
    "circle around": "circle",
    "circulated around": "circulated",
    "classify into groups": "classify",
    "climb up": "climb",
    "close proximity": "proximity",
    "close scrutiny": "scrutiny",
    "CNN news network": "CNN",
    "cold frost": "frost",
    "cold ice": "ice",
    "collaborate together": "collaborate",
    "colourful": "colorful",
    "commuting back and forth": "commuting",
    "completely unanimous": "unanimous",
    "comply with": "obey",
    "conduct a review of": "review",
    "connect up together": "connect",
    "conniption fit": "conniption",
    "consensus of opinion": "consensus",
    "constant nagging": "nagging",
    "construction sight": "construction site",
    "continue to be": "are",
    "continued to be": "was",
    "continues to be": "is",
    "cooperate together": "cooperate",
    "could care less": "could not care less",
    "could of": "could have",
    "could of been": "could have been",
    "could of had": "could have had",
    "could you tell me": "tell me",
    "couture fashion": "couture",
    "current flowing": "current",
    "current incumbent": "incumbent",
    "current passing": "current",
    "darn tootin": "correct",
    "daughter in law": "daughters-in-law",
    "daughters in law": "daughters-in-law",
    "deg": "degree",
    "diametrically opposed": "opposed",
    "did there appear to be": "was there",
    "did there begin to be": "was there",
    "did there continue to be": "was there",
    "did there seem to be": "was there",
    "different tact": "different tack",
    "dinning room": "dining room",
    "disc breaks": "disc brakes",
    "DMZ zone": "DMZ",
    "do'nt": "don't",
    "do there appear to be": "are there",
    "do there begin to be": "are there",
    "do there continue to be": "are there",
    "do there seem to be": "are there",
    "do you feel you": "are you",
    "do you feel you are": "are you",
    "do you feel you can": "can you",
    "do you feel you could": "could you",
    "do you feel you did": "did you do",
    "do you feel you had": "did you have",
    "do you feel you might": "will you",
    "do you feel you must": "should you",
    "do you feel you ought to": "should you",
    "do you feel you shall": "will you",
    "do you feel you should": "should you",
    "do you feel you will": "will you",
    "do you happen to": "do you",
    "do you know anything about": "what do you know about",
    "do you know anything on": "what do you know about",
    "do you tend to be": "are you",
    "do you think you": "do you",
    "do you think you are": "are you",
    "do you think you can": "can you",
    "do you think you could": "could you",
    "do you think you did": "did you do",
    "do you think you had": "did you have",
    "do you think you might": "will you",
    "do you think you must": "should you",
    "do you think you ought to": "should you",
    "do you think you shall": "will you",
    "do you think you should": "should you",
    "do you think you will": "will you",
    "doctorate degree": "doctorate",
    "doe snot": "does not",
    "does there appear to be": "is there",
    "does there begin to be": "is there",
    "does there continue to be": "is there",
    "does there seem to be": "is there",
    "does they": "do they",
    "dominate player": "dominant player",
    "dominate role": "dominant role",
    "door jam": "door jamb",
    "due to the fact": "because",
    "dunno": "do not know",
    "e-book": "ebook",
    "e-books": "ebooks",
    "each has their": "each has its",
    "easier then": "easier than",
    "egg yoke": "egg yolk",
    "electrical current": "electric current",
    "eliminate altogether": "eliminate",
    "elucidate for": "tell",
    "eluded to": "alluded to",
    "e-mail": "email",
    "employment opportunities": "jobs",
    "empty hole": "hole",
    "en mass": "en masse",
    "enclosed herewith": "enclosed",
    "english": "English",
    "entirely eliminating": "eliminating",
    "esp for": "especially for",
    "esp in": "especially in",
    "et al": "and others",
    "every1": "everyone",
    "everyone dose": "everyone does",
    "exact replica": "replica",
    "exact same": "same",
    "exactly the same": "the same",
    "explain to": "tell",
    "extend an invitation": "invite",
    "extreme hazard": "hazard",
    "extremely": "extremely",
    "farther then": "farther than",
    "faster then": "faster than",
    "father in law": "father-in-law",
    "fathers in law": "fathers-in-law",
    "fav": "favorite",
    "fave": "favorite",
    "favourite": "favorite",
    "feathered friends": "birds",
    "final completion": "completion",
    "final end": "end",
    "final showdown": "showdown",
    "first conceived": "conceived",
    "flat as a pancake": "flat",
    "flavour": "flavor",
    "flavours": "flavors",
    "flow of current": "current",
    "following below": "below",
    "for along time": "for a long time",
    "for awhile": "for a while",
    "for quite awhile": "for a while",
    "for the purpose of": "for",
    "forced compulsion": "compulsion",
    "foreign imports": "imports",
    "former graduate": "graduate",
    "former veteran": "veteran",
    "forth place": "fourth place",
    "frank and honest exchange": "frank exchange",
    "frank candor": "candor",
    "free gift": "gift",
    "free gratis": "gratis",
    "free reign": "free rein",
    "french": "French",
    "frozen ice": "ice",
    "frozen tundra": "tundra",
    "full compliment of": "full complement of",
    "full satisfaction": "satisfaction",
    "geddit": "get it",
    "german": "German",
    "gina": "Gina",
    "ginger": "Ginger",
    "give advice to": "counsel",
    "give and bequeath": "bequeath",
    "gonna": "going to",
    "good benefit": "benefit",
    "good success": "success",
    "Google Android": "Android",
    "google android": "Android",
    "got ran": "got run",
    "got setup": "got set up",
    "got shutdown": "got shut down",
    "got shutout": "got shut out",
    "gotcha": "I understand",
    "gotta": "have to",
    "grand total": "total",
    "grateful thanks": "thanks",
    "growing greater": "growing",
    "habitual custom": "custom",
    "had arose": "had arisen",
    "had became": "had become",
    "had began": "had begun",
    "had bore": "had borne",
    "had broke": "had broken",
    "had came": "had come",
    "had chose": "had chosen",
    "had comeback": "had come back",
    "had did": "had done",
    "had drove": "had driven",
    "had fell": "had fallen",
    "had forbad": "had forbidden",
    "had forbade": "had forbidden",
    "had gave": "had given",
    "had plead": "had pled",
    "had ran": "had run",
    "had rang": "had rung",
    "had rode": "had ridden",
    "had rose": "had risen",
    "had saw": "had seen",
    "had setup": "had set up",
    "had shook": "had shaken",
    "had threw": "had thrown",
    "had took": "had taken",
    "had underwent": "had undergone",
    "had went": "had gone",
    "had wrote": "had written",
    "hai": "yes",
    "hand the reigns": "hand the reins",
    "handwritten manuscript": "manuscript",
    "harbour": "harbor",
    "harbours": "harbors",
    "harry": "Harry",
    "has ran": "has run",
    "have ran": "have run",
    "he himself": "he",
    "he is a person who": "he",
    "held the reigns": "held the reins",
    "helluva": "hell of a",
    "hermione": "Hermione",
    "hold the reigns": "hold the reins",
    "holds the reigns": "holds the reins",
    "hone in on": "home in on",
    "hot water heater": "water heater",
    "how are you liking": "do you like",
    "how do you believe it is": "how is it",
    "how do you believe it will": "how will it",
    "how do you feel about": "do you like",
    "how do you think it is": "how is it",
    "how do you think it will": "how will it",
    "how ever": "however",
    "how in heck": "how",
    "how in hell": "how",
    "how in the heck": "how",
    "how in the world": "how",
    "how is u": "how is your",
    "how long till": "how long until",
    "how so": "why",
    "how the heck": "how",
    "how ya doing": "how are you doing",
    "hows": "how is",
    "i-Pad": "iPad",
    "i-Phone": "iPhone",
    "I figure you": "you",
    "I have to": "I must",
    "I heard that you": "you",
    "I heard you": "you",
    "I imagine you": "you",
    "I myself": "I",
    "I reckon": "I think",
    "I snot": "is not",
    "I wonder why he": "why does he",
    "I wonder why it": "why does it",
    "I wonder why she": "why does she",
    "I wonder why that": "why does that",
    "i wonder why they": "why do they",
    "iam": "I am",
    "ic": "I see",
    "idc": "I do not care",
    "idk": "I do not know",
    "iie": "no",
    "imminent at any moment": "imminent",
    "in affect": "in effect",
    "in an effort to": "to",
    "in awhile": "in a while",
    "in back of": "behind",
    "in parenthesis": "in parentheses",
    "in principal": "in principle",
    "in quite awhile": "in a while",
    "in re": "in reference to",
    "in spite of the fact that": "although",
    "in stead of": "instead of",
    "in the absence of": "without",
    "in the current moment": "now",
    "in the event that": "if",
    "in the field of": "in",
    "in this instant": "now",
    "in vein": "in vain",
    "inasmuch": "in as much",
    "individual person": "individual",
    "indulgent patience": "patience",
    "inquisitive busybody": "busybody",
    "intentional planning": "planning",
    "into affect": "into effect",
    "invited guests": "guests",
    "is able to": "can",
    "is certain to": "will",
    "is comprised of": "comprises",
    "is lead": "is led",
    "is ran": "is run",
    "is renown": "is renowned",
    "is setup": "is set up",
    "is ya": "is your",
    "it's my opinion that": "I think",
    "it id": "it is",
    "it itself": "it",
    "it was a lark": "it was fun",
    "it was Greek to me": "I could not understand it",
    "italian": "Italian",
    "ja": "yes",
    "jive with": "jibe with",
    "job functions": "job",
    "join together": "join",
    "joint collaboration": "collaboration",
    "joint cooperation": "cooperation",
    "knowledgeable experts": "experts",
    "large in size": "large",
    "larry": "Larry",
    "last but not least": "last",
    "last will and testament": "testament",
    "lay low": "lie low",
    "laying around": "lying around",
    "laying low": "lying low",
    "lays low": "lies low",
    "LCD display": "LCD",
    "lead by": "led by",
    "leading roll": "leading role",
    "LED diode": "LED",
    "lemme": "let me",
    "lesbian woman": "lesbian",
    "lesbian women": "lesbians",
    "less that": "less than",
    "less then": "less than",
    "lets": "let us",
    "lighter then": "lighter than",
    "like greased lightning": "rapidly",
    "lite": "light",
    "literate readers": "readers",
    "little baby": "baby",
    "longer in length": "longer",
    "loose to": "lose to",
    "loosing streak": "losing streak",
    "loosing the": "losing the",
    "loosing to": "losing to",
    "Los Angles": "Los Angeles",
    "lower that": "lower than",
    "lower then": "lower than",
    "made a statement": "said",
    "made reference to": "referred to",
    "major breakthrough": "breakthrough",
    "make a statement": "say",
    "mam": "mom",
    "manually by hand": "manually",
    "many frequent": "frequent",
    "marital spouse": "spouse",
    "may of been": "may have been",
    "may of had": "may have had",
    "may possibly": "may",
    "meaningful dialogue": "dialogue",
    "mental thought": "thought",
    "merci": "thanks",
    "merge together": "merge",
    "might of been": "might have been",
    "might of had": "might have had",
    "minuscule": "miniscule",
    "missing gaps": "gaps",
    "mix together": "blend",
    "more easier": "easier",
    "more optimal": "better",
    "more that": "more than",
    "more then": "more than",
    "mother in law": "mother-in-law",
    "mothers in law": "mothers-in-law",
    "must of": "must have",
    "must of been": "must have been",
    "must of had": "must have had",
    "mutual confidence": "confidence",
    "mutual cooperation": "cooperation",
    "my question is are": "are",
    "my question is can": "can",
    "my question is could": "could",
    "my question is do": "do",
    "my question is have": "have",
    "my question is how": "how",
    "my question is should": "should",
    "my question is what": "what",
    "my question is when": "when",
    "my question is where": "where",
    "my question is who": "who",
    "my question is why": "why",
    "my question is would": "would",
    "NATO organization": "NATO",
    "naturally": "naturally",
    "near proximity": "proximity",
    "nearly everything": "everything",
    "neath": "beneath",
    "negative misfortune": "misfortune",
    "negative no": "no",
    "never ever": "never",
    "new discovery": "discovery",
    "new innovations": "innovations",
    "new neophyte": "neophyte",
    "new recruit": "recruit",
    "no where to": "nowhere to",
    "nomenclature terms": "nomenclature",
    "none at all": "none",
    "nostalgia for the past": "nostalgia",
    "not a bit": "no",
    "not atm": "not at the moment",
    "not many": "few",
    "not old enough": "too young",
    "not possible": "impossible",
    "not sufficient enough": "insufficient",
    "not sur": "not sure",
    "not the same": "different",
    "null and void": "void",
    "old adage": "adage",
    "old customs": "customs",
    "old senior citizens": "senior citizens",
    "omelet": "omelette",
    "on most occasions": "usually",
    "one and the same": "the same",
    "one in done": "one and done",
    "one in the same": "one and the same",
    "opt for": "choose",
    "opted for": "chose",
    "oral conversation": "conversation",
    "organise": "organize",
    "original founder": "founder",
    "original source": "source",
    "other then": "other than",
    "over the duration of": "during",
    "overused cliche": "cliche",
    "particular interest": "interest",
    "past experience": "experience",
    "past history": "history",
    "past tradition": "tradition",
    "per say": "per se",
    "perfectly legitimate": "legitimate",
    "perform an assessment of": "assess",
    "persistent obsession": "obsession",
    "personal friend": "friend",
    "personal friendship": "friendship",
    "personal individual": "individual",
    "personal opinion": "opinion",
    "personally, I": "I",
    "perv": "pervert",
    "PIN number": "PIN",
    "pizza pie": "pizza",
    "place under water": "submerge",
    "play actor": "actor",
    "playoff birth": "playoff berth",
    "poisonous venoms": "venoms",
    "polar opposites": "opposites",
    "pop star": "popstar",
    "positive yes": "yes",
    "postponed until later": "postponed",
    "potentially capable": "capable",
    "pre planning": "planning",
    "present incumbent": "incumbent",
    "previously listed above": "previously listed",
    "principle activity": "principal activity",
    "principle source": "principal source",
    "principle use": "principal use",
    "promise land": "promised land",
    "pruned out": "pruned",
    "put fourth": "put forth",
    "put it in a nutshell": "condense it",
    "puzzling in nature": "puzzling",
    "que": "queue",
    "rather then": "rather than",
    "real actual": "actual",
    "receded back": "receded",
    "recently new": "new",
    "rectangular in shape": "rectangular",
    "refer back": "refer",
    "regular routine": "routine",
    "reign in": "rein in",
    "reigned in": "reined in",
    "reigns of power": "reins of power",
    "repeat again": "repeat",
    "resulting effects": "effects",
    "retreating back": "retreating",
    "return again": "return",
    "return back": "return",
    "revert back": "revert",
    "right now": "currently",
    "rite": "right",
    "roll player": "role player",
    "root cause": "cause",
    "round circle": "circle",
    "round in shape": "round",
    "round wheels": "wheels",
    "rox": "rocks",
    "ruling junta": "junta",
    "russian": "Russian",
    "safe haven": "haven",
    "safe sanctuary": "sanctuary",
    "seedling plant": "seedling",
    "serious danger": "danger",
    "severely": "severely",
    "shape and form": "shape",
    "sharp point": "point",
    "she herself": "she",
    "she is a person who": "she",
    "shorter in length": "shorter",
    "shorter then": "shorter than",
    "should of been": "should have been",
    "should of had": "should have had",
    "shout at": "tell",
    "sink down": "sink",
    "sister in law": "sister-in-law",
    "sisters in law": "sisters-in-law",
    "small in size": "small",
    "small speck": "speck",
    "smaller then": "smaller than",
    "smarter then": "smarter than",
    "sneak peak": "sneak peek",
    "sneaking suspicion": "suspicion",
    "so do I": "I do also",
    "some of the": "some",
    "son in law": "son-in-law",
    "sons in law": "sons-in-law",
    "sorta": "sort of",
    "sos": "same old shit",
    "sox": "socks",
    "specific examples": "examples",
    "spell out": "explain",
    "spread like wildfire": "spread rapidly",
    "square in shape": "square",
    "staged scenario": "scenario",
    "straight of": "Strait of",
    "stronger then": "stronger than",
    "successful achievement": "achievement",
    "sudden impulse": "impulse",
    "suffered poorly": "suffered",
    "sum total": "total",
    "summarize briefly": "summarize",
    "suppose to": "supposed to",
    "surrounded on all sides": "surrounded",
    "surrounding circumstances": "circumstances",
    "sux": "sucks",
    "swiss": "Swiss",
    "take a nap": "snooze",
    "take affect": "take effect",
    "take the reigns": "take the reins",
    "taking the reigns": "taking the reins",
    "talk to me about": "describe",
    "team comprised of": "team composed of",
    "technical jargon": "jargon",
    "tell me what you": "what do you",
    "tell me what your": "what is your",
    "temporary reprieve": "reprieve",
    "that maybe": "that may be",
    "the african continent": "Africa",
    "the are": "they are",
    "the asian continent": "Asia",
    "the central american continent": "Central America",
    "the crack of dawn": "dawn",
    "the european continent": "Europe",
    "the future to come": "the future",
    "the had": "they had",
    "the north american continent": "north america",
    "the question is are": "are",
    "the question is can": "can",
    "the question is could": "could",
    "the question is do": "do",
    "the question is have": "have",
    "the question is how": "how",
    "the question is should": "should",
    "the question is what": "what",
    "the question is when": "when",
    "the question is where": "where",
    "the question is who": "who",
    "the question is why": "why",
    "the question is would": "would",
    "the south american continent": "south america",
    "there is no doubt but that": "no doubt",
    "they themself": "they",
    "they themselves": "they",
    "they where": "they were",
    "to make a long story short": "to summarize",
    "to setup": "to set up",
    "total destruction": "destruction",
    "tried and true": "proven",
    "true facts": "facts",
    "try and find": "try to find",
    "try and get": "try to get",
    "try and see": "try to see",
    "try hard": "endeavor",
    "ultimate goal": "goal",
    "under the weather": "sick",
    "undergraduate student": "student",
    "unexpected emergency": "emergency",
    "unexpected surprise": "surprise",
    "unhealthy sickness": "sickness",
    "university college students": "university students",
    "unmarried bachelor": "bachelor",
    "unmarried old maid": "old maid",
    "unnecessary redundancies": "redundancies",
    "unsolved mystery": "mystery",
    "usual custom": "custom",
    "vacillating back and forth": "vacillating",
    "VIN number": "VIN",
    "visible with your own eyes": "visible",
    "walk clumsily": "stagger",
    "wall mural": "mural",
    "wander back and forth": "meander",
    "watching and observing": "watching",
    "water hydrant": "hydrant",
    "we are in receipt of": "we have received",
    "we ourself": "we",
    "we ourselves": "we",
    "well I": "I",
    "well you": "you",
    "what 's up": "what is new",
    "what brings you here": "why are you here",
    "what brings you in": "why are you in",
    "what brings you into": "why are you into",
    "what brings you out": "why are you out",
    "what brings you to": "why are you at",
    "what in hell": "what",
    "what in the heck": "what",
    "what in the hell": "what",
    "what in the world": "what",
    "what is going on in": "what is happening in",
    "what the heck": "what",
    "when do you believe it is": "when is it",
    "when do you believe it will": "when will it",
    "when do you think it is": "when is it",
    "when do you think it will": "when will it",
    "when in the world": "when",
    "where do you believe it is": "where is it",
    "where do you believe it will": "where will it",
    "where do you think it is": "where is it",
    "where do you think it will": "where will it",
    "where in heck": "where",
    "where in the heck": "where",
    "where in the hell": "where",
    "where in the world": "where",
    "where the heck": "where",
    "where the hell": "where",
    "which comprised of": "which consisted of",
    "who do you believe": "who",
    "who do you think": "who",
    "who id": "who is",
    "who in heck": "who",
    "who in hell": "who",
    "who in the heck": "who",
    "who in the world": "who",
    "who the heck": "who",
    "who where": "who were",
    "whoa": "stop",
    "whom do you believe": "whom",
    "whom do you think": "whom",
    "why do you believe it is": "why is it",
    "why do you believe it will": "why will it",
    "why do you think he is": "why is he",
    "why do you think I am": "why am i",
    "why do you think it is": "why is it",
    "why do you think it will": "why will it",
    "why in heck": "why",
    "why in hell": "why",
    "why in the heck": "why",
    "why in the world": "why",
    "why is it that": "why do",
    "why the heck": "why",
    "widow woman": "widow",
    "widower man": "widower",
    "will comprise of": "will consist of",
    "will of been": "will have been",
    "will of had": "will have had",
    "with au jus": "au jus",
    "wordy and verbose": "verbose",
    "works like a dog": "works hard",
    "worth its weight in gold": "valuable",
    "would comprise of": "would consist of",
    "would of been": "would have been",
    "would of had": "would have had",
    "yo": "you",
    "you are saying that you": "you",
    "you are saying you": "you",
    "you have to": "you must",
    "you re": "you are",
    "you reckon": "you think",
    "you this afternoon": "you",
    "you this evening": "you",
    "you this morning": "you",
    "you today": "you",
    "you tonight": "you",
    "you tube": "YouTube",
    "you yourself": "you",
    "youthful teenagers": "teenagers",
    "government comprised of": "government composed of",
    "it is probable that": "probably"
};
var replacements = {
    "Apr": "April",
    "Apr.": "April",
    "ariz.": "Arizona",
    "Aug": "August",
    "Aug.": "August",
    "colo.": "Colorado",
    "Corp": "Corporation",
    "Corp.": "Corporation",
    "Dec": "December",
    "Dec.": "December",
    "e.g.": "for example",
    "ex.": "for example",
    "FB": "Facebook",
    "Feb": "February",
    "Feb.": "February",
    "fla.": "Florida",
    "ft": "feet",
    "ft.": "feet",
    "i.e.": "for example",
    "ie:": "for example:",
    "Inc": "Incorporated",
    "Inc.": "Incorporated",
    "Jan": "January",
    "Jan.": "January",
    "Jul.": "July",
    "Jul": "July",
    "Jun": "June",
    "Jun.": "June",
    "kg": "kilogram",
    "kg.": "kilogram",
    "kgs.": "kilograms",
    "lb": "pound",
    "lb.": "pound",
    "lbs": "pounds",
    "lbs.": "pounds",
    "Ltd": "Limited",
    "Ltd.": "Limited",
    "Mar.": "March",
    "Mar": "March",
    "mich.": "Michigan",
    "minn.": "Minnesota",
    "Mr": "Mr.",
    "Mrs": "Mrs.",
    "Mt.": "Mount",
    "nev.": "Nevada",
    "Nov": "November",
    "Nov.": "November",
    "Oct": "October",
    "Oct.": "October",
    "okla.": "Oklahoma",
    "oz": "ounce",
    "oz.": "ounce",
    "PLC.": "PLC",
    "qt": "quart",
    "Sep": "September",
    "sep.": "September",
    "Sept": "September",
    "Sept.": "September",
    "u s a": "U.S.A.",
    "USA": "U.S.A.",
    "v.": "versus",
    "vs.": "versus",
    "yr": "year",
    "yr.": "year",
    "Dr": "Doctor",
    "Dr.": "Doctor",
    "prof.": "professor",
    "12 midnight": "midnight",
    "12 noon": "noon",
    "1920's": "1920s",
    "1930's": "1930s",
    "1940's": "1940s",
    "1950's": "1950s",
    "1960's": "1960s",
    "1970's": "1970s",
    "1980's": "1980s",
    "1990's": "1990s",
    "20s": "1920s",
    "30s": "1930s",
    "40s": "1940s",
    "50s": "1950s",
    "60s": "1960s",
    "70s": "1970s",
    "80s": "1980s",
    "90s": "1990s",
    "twenties": "20",
    "thirties": "30",
    "forties": "40",
    "fifties": "50",
    "sixties": "60",
    "seventies": "70",
    "eighties": "80",
    "nineties": "90",
    "the twenties": "1920s",
    "the thirties": "1930s",
    "the forties": "1940s",
    "the fifties": "1950s",
    "the sixties": "1960s",
    "the seventies": "1970s",
    "the eighties": "1980s",
    "the nineties": "1990s",
    "a.m": "a.m.",
    "A.M. in the morning": "a.m.",
    "PM": "p.m.",
    "p.m": "p.m.",
    "p.m. in the evening": "p.m.",
    "pm": "p.m.",
    "cannot": "can not",
    "fwiw": "for what it is worth",
    "Gameboy": "Game Boy",
    "mais non": "no",
    "mais oui": "yes",
    "meds": "medicines",
    "nada": "nothing",
    "noyb": "none of your business",
    "np": "no problem",
    "nvm": "nevermind",
    "ny": "New York",
    "nyc": "New York City",
    "kinda": "kind of",
    "oui": "yes",
    "outta": "out of",
    "pourquoi": "why",
    "ppl": "people",
    "ppls": "people",
    "scifi": "science fiction",
    "shalt": "shall",
    "shant": "shall not",
    "side affect": "side effect",
    "sq": "square",
    "sq.": "square",
    "the US": "the United States",
    "thee": "you",
    "thou": "you",
    "thx": "thanks",
    "thy": "your",
    "til": "until",
    "times up": "your time is up",
    "twas": "it was",
    "tptb": "the powers that be",
    "xmas": "Christmas",
    "Xmas": "Christmas",
    "&": "and",
    "e'en": "even",
    "ne'er": "never",
    "ain't": "is not",
    "amn't": "am not",
    "anyone'll": "anyone will",
    "bettern't": "better not",
    "c'mere": "come here",
    "c'mon": "come on",
    "can't've": "can not have",
    "cap'n": "captain",
    "couldn't've": "couldn't have",
    "daren't": "dare not",
    "doin'": "doing",
    "don'tcha": "don't you",
    "everybody'll": "everybody will",
    "g'day": "good day",
    "g'night": "good night",
    "gov't": "government",
    "how're": "how are",
    "i'd've": "I would have",
    "I'd've": "I would have",
    "im": "I'm",
    "Im": "I'm",
    "in't": "is it not",
    "int'l": "international",
    "it'd": "it would",
    "it'sn't": "it is not",
    "li'l": "little",
    "m'ladies": "my ladies",
    "m'lady": "my lady",
    "m'lord": "my lord",
    "m'lords": "my lords",
    "ma'am": "madam",
    "mayn't": "may not",
    "might've": "might have",
    "mightn't": "might not",
    "more'n": "more than",
    "must've": "must have",
    "mustn't": "must not",
    "n't": "not",
    "needn't": "need not",
    "o'er": "over",
    "oughtn't": "ought not",
    "sha'n't": "shall not",
    "sha'nt": "shall not",
    "shalln't": "shall not",
    "shan't": "shall not",
    "shouldn't've": "should not have",
    "somethin'": "something",
    "slumb'ring": "slumbering",
    "t'was'nt": "it was not",
    "t'was": "it was",
    "things'll": "things will",
    "this'd": "this would",
    "thro'": "through",
    "wat's": "what is",
    "whene'er": "whenever",
    "where'm": "where am",
    "where're": "where are",
    "who're": "who are",
    "y'all": "you all",
    "all y'all": "all of you",
    "y'could've": "you could have",
    "y'know": "you know",
    "you'da": "you would have",
    "you'l": "you'll",
    "you'r": "you're",
    "you'v": "you've",
    "w/": "with"
};
var corrections = {
    "abit": "a bit",
    "abou": "about",
    "abouta": "about a",
    "aboutit": "about it",
    "aboutthe": "about the",
    "accidently": "accidentally",
    "accordingto": "according to",
    "afterthe": "after the",
    "afterwhich": "after which",
    "againstt he": "against the",
    "ahold of": "a hold of",
    "aint": "is not",
    "alot": "a lot",
    "alot of": "a lot of",
    "altho": "although",
    "andone": "and one",
    "andthe": "and the",
    "anually": "annually",
    "archeological": "archaeological",
    "archeologically": "archaeologically",
    "archeologist": "archaeologist",
    "archeologists": "archaeologists",
    "archeology": "archaeology",
    "arent": "are not",
    "askt he": "ask the",
    "asthe": "as the",
    "aswell": "as well",
    "atleast": "at least",
    "atthe": "at the",
    "becausea": "because a",
    "becauseof": "because of",
    "becausethe": "because the",
    "becauseyou": "because you",
    "bonified": "bona fide",
    "brrr": "it is cold",
    "butthe": "but the",
    "canna": "can not",
    "carbs": "carbohydrates",
    "cemataries": "cemetaries",
    "cematary": "cemetary",
    "childrens": "children's",
    "claerly": "clearly",
    "colourize": "colorize",
    "compleatly": "completely",
    "completly": "completely",
    "confectionary": "confectionery",
    "cosher": "kosher",
    "coulda": "could have",
    "couldnt": "could not",
    "couldthe": "could the",
    "couldve": "could have",
    "crewcut": "crew cut",
    "cyberattack": "cyber attack",
    "dammit": "damn it",
    "damnit": "damn it",
    "dats": "that is",
    "definateley": "definitely",
    "definately": "definitely",
    "definatly": "definitely",
    "defineteley": "definitely",
    "definetely": "definitely",
    "definetly": "definitely",
    "definitly": "definitely",
    "defintley": "definitely",
    "dicussing": "discussing",
    "diden't": "didn't",
    "didnot": "did not",
    "didnt": "didn't",
    "did'nt": "didn't",
    "diningroom": "dining room",
    "doesnt": "doesn't",
    "dogbreeder": "dog breeder",
    "dont": "don't",
    "dontcha": "do not you",
    "eachother": "each other",
    "enroute": "en route",
    "extreamly": "extremely",
    "extremly": "extremely",
    "faired badly": "fared badly",
    "faired better": "fared better",
    "faired poorly": "fared poorly",
    "faired well": "fared well",
    "faired worse": "fared worse",
    "ffavours": "favours",
    "fromt he": "from the",
    "fromthe": "from the",
    "gentlemens": "gentlemen's",
    "getcha": "get you",
    "glamourous": "glamorous",
    "good riddens": "good riddance",
    "habeus corpus": "habeas corpus",
    "hadbeen": "had been",
    "hadnt": "hadn't",
    "hafta": "have to",
    "hasbeen": "has",
    "hasnt": "hasn't",
    "have'nt": "haven't",
    "havebeen": "have been",
    "havent": "haven't",
    "Hawai'i": "Hawaii",
    "hayfever": "hay fever",
    "hesaid": "he said",
    "hewas": "he was",
    "homerun": "home run",
    "hygenic": "hygienic",
    "i'ts": "it's",
    "incase of": "in case of",
    "infront": "in front",
    "int he": "in the",
    "inteh": "in the",
    "inthe": "in the",
    "inwhich": "in which",
    "is'nt": "isn't",
    "isnt": "isn't",
    "isthe": "is the",
    "itis": "it is",
    "itsself": "itself",
    "itwas": "it was",
    "itym": "I think you mean",
    "itz": "it is",
    "ive": "I have",
    "kan": "can",
    "karisma": "charisma",
    "ketsup": "catsup",
    "kewl": "cool",
    "Klu Klux Klan": "Ku Klux Klan",
    "lastname": "last name",
    "lastyear": "last year",
    "leapyear": "leap year",
    "leggo": "let go",
    "livingroom": "living room",
    "lotsa": "lots of",
    "massmedia": "mass media",
    "mayn": "many",
    "mightnt": "might not",
    "milage": "mileage",
    "moreso": "more so",
    "mustnt": "mustn't",
    "natuarlly": "naturally",
    "naturaly": "naturally",
    "naturely": "naturally",
    "naturually": "naturally",
    "neednt": "needn't",
    "neverever": "never ever",
    "Newyorker": "New Yorker",
    "nite": "night",
    "noone": "no one",
    "nuff": "enough",
    "ofits": "of its",
    "oft he": "of the",
    "ofthe": "of the",
    "oneof": "one of",
    "onepoint": "one point",
    "ont he": "on the",
    "onthe": "on the",
    "oughta": "ought to",
    "oughtnt": "ought not",
    "outloud": "out loud",
    "outof": "out of",
    "overthe": "over the",
    "partof": "part of",
    "percentof": "percent of",
    "percentto": "percent to",
    "persay": "per se",
    "Puertorrican": "Puerto Rican",
    "saidhe": "said he",
    "saidit": "said it",
    "saidt he": "said the",
    "saidthat": "said that",
    "saidthe": "said the",
    "sayeth": "say",
    "severley": "severely",
    "severly": "severely",
    "shaddup": "shut up",
    "shesaid": "she said",
    "shoulda": "should have",
    "shouldnt": "shouldn't",
    "shuddup": "shut up",
    "somekinda": "some kind of",
    "sportscar": "sports car",
    "spose": "suppose",
    "spunoff": "spun off",
    "srsly": "seriously",
    "tellt he": "tell the",
    "tennisplayer": "tennis player",
    "thats": "that is",
    "the were": "they were",
    "thecompany": "the company",
    "thefirst": "the first",
    "thegovernment": "the government",
    "their are": "there are",
    "their is": "there is",
    "themself": "themselves",
    "themselfs": "themselves",
    "thenew": "the new",
    "theres": "there is",
    "thesame": "the same",
    "thetwo": "the two",
    "theyd": "they would",
    "thier": "their",
    "thisyear": "this year",
    "thnx": "thanks",
    "thru": "through",
    "to g": "to go",
    "todays": "today's",
    "toldt he": "told the",
    "took affect": "took effect",
    "took the reigns": "took the reins",
    "tookover": "took over",
    "tot he": "to the",
    "totaly": "totally",
    "totalyl": "totally",
    "tothe": "to the",
    "undert he": "under the",
    "unforetunately": "unfortunately",
    "UnitedStates": "United States",
    "Unites States": "United States",
    "wa snot": "was not",
    "wahtevah": "whatever",
    "wanna": "want to",
    "was'nt": "wasn't",
    "was aloud": "was allowed",
    "wasnt": "wasn't",
    "were are": "where are",
    "werent": "weren't",
    "whaddya": "what do you",
    "what is u": "what is your",
    "whateva": "whatever",
    "whatevah": "whatever",
    "whats": "what's",
    "whats your": "what's your",
    "whazzup": "what is new",
    "when on to": "went on to",
    "whent he": "when the",
    "where is u": "where is your",
    "whichones": "which ones",
    "whicht he": "which the",
    "who is u": "who is your",
    "whos your": "who's your",
    "wilbe": "will be",
    "willbe": "will be",
    "willya": "will you",
    "witcha": "with you",
    "witha": "with a",
    "withregards": "with regards",
    "witht he": "with the",
    "withthe": "with the",
    "wo": "who",
    "womens": "women's",
    "wont": "won't",
    "worse-case scenario": "worst-case scenario",
    "worse then": "worse than",
    "wotcha": "what have you",
    "would of": "would have",
    "wouldbe": "would be",
    "wouldnt": "wouldn't",
    "wreck havoc": "wreak havoc",
    "yessum": "yes Madam",
    "yo mamm": "your mother",
    "yo momma": "your mother",
    "youare": "you are",
    "younger then": "younger than",
    "your a": "you're a",
    "your such": "you're such",
    "youre": "you're",
    "yourselve": "yourself",
    "yourslef": "yourself",
    "youself": "yourself",
    "ypu": "you",
    "yu": "you",
    "yuor": "your",
    "additinally": "additionally",
    "aditionally": "additionally",
    "Celcious": "Celcius",
    "abanden": "abandon",
    "abandonned": "abandoned",
    "abberation": "aberration",
    "abbout": "about",
    "abbriviation": "abbreviation",
    "aberation": "aberration",
    "abilties": "abilities",
    "abizmal": "abysmal",
    "Aborignal": "Aboriginal",
    "abortificant": "abortifacient",
    "accually": "actually",
    "actualyl": "actually",
    "acutally": "actually",
    "actualy": "actually",
    "abreviation": "abbreviation",
    "abritrary": "arbitrary",
    "abriviate": "abbreviate",
    "abscence": "absence",
    "abscound": "abscond",
    "absense": "absence",
    "absorbsion": "absorption",
    "absorbtion": "absorption",
    "absove": "absolve",
    "abstanence": "abstinence",
    "abundacies": "abundances",
    "abundancies": "abundances",
    "abundence": "abundance",
    "abundent": "abundant",
    "abundunt": "abundant",
    "abutts": "abuts",
    "acadamy": "academy",
    "acadmic": "academic",
    "acatemy": "academy",
    "accademy": "academy",
    "accellerate": "accelerate",
    "accellerating": "accelerating",
    "accelleration": "acceleration",
    "acceptence": "acceptance",
    "acceptible": "acceptable",
    "acceptibly": "acceptably",
    "accesabel": "accessible",
    "accesabele": "accessible",
    "accesable": "accessible",
    "accesibel": "accessible",
    "accesibele": "accessible",
    "accesible": "accessible",
    "accesories": "accessories",
    "accesory": "accessory",
    "accessabel": "accessible",
    "accessabele": "accessible",
    "accessable": "accessible",
    "accessibel": "accessible",
    "accessibele": "accessible",
    "accidant": "accident",
    "accidentaly": "accidentally",
    "acclimitization": "acclimatization",
    "accomadate": "accommodate",
    "accomadated": "accommodated",
    "accomadates": "accommodates",
    "accomadatin": "accommodation",
    "accomadating": "accommodating",
    "accomadatins": "accommodations",
    "accomadation": "accommodation",
    "accomadations": "accommodations",
    "accomadtion": "accommodation",
    "accomadtions": "accommodations",
    "accomany": "accompany",
    "accomanying": "accompanying",
    "accomidate": "accommodate",
    "accomidated": "accommodated",
    "accomidates": "accommodates",
    "accomidating": "accommodating",
    "accomidation": "accommodation",
    "accomidations": "accommodations",
    "accommadate": "accommodate",
    "accommadated": "accommodated",
    "accommadates": "accommodates",
    "accommadatin": "accommodation",
    "accommadating": "accommodating",
    "accommadatins": "accommodations",
    "accommadation": "accommodation",
    "accommadations": "accommodations",
    "accommadtion": "accommodation",
    "accommadtions": "accommodations",
    "accommidate": "accommodate",
    "accommidated": "accommodated",
    "accommidates": "accommodates",
    "accommidating": "accommodating",
    "accommidation": "accommodation",
    "accommidations": "accommodations",
    "accommodatin": "accommodation",
    "accommodatins": "accommodations",
    "accommodtion": "accommodation",
    "accommodtions": "accommodations",
    "accomodate": "accommodate",
    "accomodated": "accommodated",
    "accomodates": "accommodates",
    "accomodatin": "accommodation",
    "accomodating": "accommodating",
    "accomodatins": "accommodations",
    "accomodation": "accommodation",
    "accomodations": "accommodations",
    "accomodtion": "accommodation",
    "accomodtions": "accommodations",
    "accompanyed": "accompanied",
    "accompish": "accomplish",
    "accompished": "accomplished",
    "accompishes": "accomplishes",
    "accordeon": "accordion",
    "accordian": "accordion",
    "accordianists": "accordionists",
    "accoring": "according",
    "accoustic": "acoustic",
    "accoustically": "acoustically",
    "accussed": "accused",
    "acedemic": "academic",
    "acesabel": "accessible",
    "acesabele": "accessible",
    "acesable": "accessible",
    "acesibel": "accessible",
    "acesibele": "accessible",
    "acesible": "accessible",
    "acess": "access",
    "acessabel": "accessible",
    "acessabele": "accessible",
    "acessable": "accessible",
    "acessibel": "accessible",
    "acessibele": "accessible",
    "acessible": "accessible",
    "acessories": "accessories",
    "acessory": "accessory",
    "acheeve": "achieve",
    "acheive": "achieve",
    "acheived": "achieved",
    "acheivement": "achievement",
    "acheivements": "achievements",
    "acheives": "achieves",
    "acheiving": "achieving",
    "acheivment": "achievement",
    "acheivments": "achievements",
    "achievment": "achievement",
    "achievments": "achievements",
    "achitecture": "architecture",
    "acknowledgement": "acknowledgment",
    "acomadate": "accommodate",
    "acomadated": "accommodated",
    "acomadates": "accommodates",
    "acomadatin": "accommodation",
    "acomadating": "accommodating",
    "acomadatins": "accommodations",
    "acomadation": "accommodation",
    "acomadations": "accommodations",
    "acomadtion": "accommodation",
    "acomadtions": "accommodations",
    "acomidate": "accommodate",
    "acomidated": "accommodated",
    "acomidates": "accommodates",
    "acomidating": "accommodating",
    "acomidation": "accommodation",
    "acomidations": "accommodations",
    "acommadate": "accommodate",
    "acommadated": "accommodated",
    "acommadates": "accommodates",
    "acommadatin": "accommodation",
    "acommadating": "accommodating",
    "acommadatins": "accommodations",
    "acommadation": "accommodation",
    "acommadations": "accommodations",
    "acommadtion": "accommodation",
    "acommadtions": "accommodations",
    "acommidate": "accommodate",
    "acommidated": "accommodated",
    "acommidates": "accommodates",
    "acommidating": "accommodating",
    "acommidation": "accommodation",
    "acommidations": "accommodations",
    "acommodate": "accommodate",
    "acommodated": "accommodated",
    "acommodates": "accommodates",
    "acommodatin": "accommodation",
    "acommodating": "accommodating",
    "acommodatins": "accommodations",
    "acommodation": "accommodation",
    "acommodations": "accommodations",
    "acommodtion": "accommodation",
    "acommodtions": "accommodations",
    "acomodate": "accommodate",
    "acomodated": "accommodated",
    "acomodates": "accommodates",
    "acomodatin": "accommodation",
    "acomodating": "accommodating",
    "acomodatins": "accommodations",
    "acomodation": "accommodation",
    "acomodations": "accommodations",
    "acomodtion": "accommodation",
    "acomodtions": "accommodations",
    "acomplish": "accomplish",
    "acomplished": "accomplished",
    "acomplishment": "accomplishment",
    "acomplishments": "accomplishments",
    "acoostic": "acoustic",
    "acording": "according",
    "acordingly": "accordingly",
    "acquaintence": "acquaintance",
    "acquaintences": "acquaintances",
    "acqueus": "aqueous",
    "acquiantence": "acquaintance",
    "acquiantences": "acquaintances",
    "acquiess": "acquiesce",
    "acquited": "acquitted",
    "acros": "across",
    "acrost": "across",
    "acryllic": "acrylic",
    "acter": "actor",
    "activites": "activities",
    "activitties": "activities",
    "acuracy": "accuracy",
    "acustom": "accustom",
    "acustommed": "accustomed",
    "adament": "adamant",
    "adaptions": "adaptations",
    "adaquit": "adequate",
    "additinal": "additional",
    "addmission": "admission",
    "addopt": "adopt",
    "addopted": "adopted",
    "addoptive": "adoptive",
    "addres": "address",
    "addresable": "addressable",
    "addresing": "addressing",
    "addtion": "addition",
    "addtional": "additional",
    "adecuate": "adequate",
    "adequit": "adequate",
    "adequite": "adequate",
    "adew": "adieu",
    "adhearing": "adhering",
    "adheasive": "adhesive",
    "adition": "addition",
    "aditional": "additional",
    "adjacancy": "adjacency",
    "adjacant": "adjacent",
    "adjatate": "agitate",
    "adjative": "adjective",
    "admendment": "amendment",
    "administartion": "administration",
    "adminstrate": "administrate",
    "adminstration": "administration",
    "adminstrative": "administrative",
    "adminstrator": "administrator",
    "admissability": "admissibility",
    "admissable": "admissible",
    "adquire": "acquire",
    "adquired": "acquired",
    "adquires": "acquires",
    "adquiring": "acquiring",
    "adres": "address",
    "adresable": "addressable",
    "adresing": "addressing",
    "adress": "address",
    "adressable": "addressable",
    "advanage": "advantage",
    "advanatagous": "advantageous",
    "advantagous": "advantageous",
    "adventourous": "adventurous",
    "advertisment": "advertisement",
    "advertisments": "advertisements",
    "advesary": "adversary",
    "adviced": "advised",
    "aeriel": "aerial",
    "aeriels": "aerials",
    "afect": "affect",
    "afected": "affected",
    "afecting": "affecting",
    "affadavit": "affidavit",
    "afficianado": "aficionado",
    "afficionado": "aficionado",
    "afficionados": "aficionados",
    "affilate": "affiliate",
    "affilict": "afflict",
    "affilicted": "afflicted",
    "affilliate": "affiliate",
    "affilliated": "affiliated",
    "affilliates": "affiliates",
    "affraid": "afraid",
    "afiliate": "affiliate",
    "afiliated": "affiliated",
    "afiliates": "affiliates",
    "afilliate": "affiliate",
    "afilliated": "affiliated",
    "afilliates": "affiliates",
    "after-affect": "aftereffect",
    "afterwords": "afterwards",
    "agains": "against",
    "aggenst": "against",
    "aggreement": "agreement",
    "aggregious": "egregious",
    "aggresive": "aggressive",
    "aggresively": "aggressively",
    "aggrivate": "aggravate",
    "agian": "again",
    "agin": "against",
    "agravate": "aggravate",
    "agre": "agree",
    "agred": "agreed",
    "agreemnet": "agreement",
    "agreemnets": "agreements",
    "agregate": "aggregate",
    "agregates": "aggregates",
    "agreing": "agreeing",
    "agremeent": "agreement",
    "agremeents": "agreements",
    "agression": "aggression",
    "agressive": "aggressive",
    "agressively": "aggressively",
    "agriculturalists": "agriculturists",
    "agrieved": "aggrieved",
    "ahmond": "almond",
    "aiports": "airports",
    "airator": "aerator",
    "airbourne": "airborne",
    "airconditioned": "air-conditioned",
    "aircrafts": "aircraft",
    "aireline": "airline",
    "airelines": "airlines",
    "airial": "aerial",
    "airoport": "airport",
    "airoports": "airports",
    "airporta": "airports",
    "ajacant": "adjacent",
    "ajacent": "adjacent",
    "ajative": "adjective",
    "ajoin": "adjoin",
    "ajoined": "adjoined",
    "ajoining": "adjoining",
    "ajustment": "adjustment",
    "albiet": "albeit",
    "alcemy": "alchemy",
    "alchohol": "alcohol",
    "alchoholic": "alcoholic",
    "alchol": "alcohol",
    "alcholic": "alcoholic",
    "alcohal": "alcohol",
    "alcoholical": "alcoholic",
    "aledge": "allege",
    "aledged": "alleged",
    "aledges": "alleges",
    "alegance": "allegiance",
    "alege": "allege",
    "aleged": "alleged",
    "alegience": "allegiance",
    "algee": "algae",
    "algoritm": "algorithm",
    "algoritms": "algorithms",
    "aline": "align",
    "allagory": "allegory",
    "allaince": "alliance",
    "alledge": "allege",
    "alledged": "alleged",
    "alledges": "alleges",
    "allegence": "allegiance",
    "allegience": "allegiance",
    "allign": "align",
    "alligned": "aligned",
    "alliviate": "alleviate",
    "allong": "along",
    "allopone": "allophone",
    "allopones": "allophones",
    "allowence": "allowance",
    "allright": "all",
    "allthough": "although",
    "alltime": "all-time",
    "allwasy": "always",
    "allways": "always",
    "allwyas": "always",
    "along side": "alongside",
    "alotted": "allotted",
    "althetic": "athletic",
    "alway": "always",
    "ambadexterous": "ambidextrous",
    "amealearate": "ameliorate",
    "ameba": "amoeba",
    "amendmant": "amendment",
    "amentities": "amenities",
    "Ameria": "America",
    "america": "America",
    "amkes": "makes",
    "amking": "making",
    "ammend": "amend",
    "ammended": "amended",
    "ammendment": "amendment",
    "ammount": "amount",
    "ampatheater": "amphitheater",
    "ampitheater": "amphitheatre",
    "ampitheaters": "amphitheatres",
    "ampitheatre": "amphitheatre",
    "ampitheatres": "amphitheatres",
    "Amtrack": "Amtrak",
    "amung": "among",
    "amungst": "amongst",
    "amusemnet": "amusement",
    "amusment": "amusement",
    "Anahiem": "Anaheim",
    "analagous": "analogous",
    "analitic": "analytic",
    "analize": "analyze",
    "analogeous": "analogous",
    "analyist": "analyst",
    "analyse": "analyze",
    "anarkistic": "anarchistic",
    "ancester": "ancestor",
    "ancesteral": "ancestral",
    "ancestoral": "ancestral",
    "ancilliary": "ancillary",
    "aneeling": "annealing",
    "angshus": "anxious",
    "angziety": "anxiety",
    "anialate": "annihilate",
    "anihilation": "annihilation",
    "anjanew": "ingenue",
    "ankel": "ankle",
    "annaversery": "anniversary",
    "annoint": "anoint",
    "annointed": "anointed",
    "annointing": "anointing",
    "annoints": "anoints",
    "annonomus": "anonymous",
    "annoyence": "annoyance",
    "annuled": "annulled",
    "anomolies": "anomalies",
    "anomolous": "anomalous",
    "anomoly": "anomaly",
    "anonimity": "anonymity",
    "anothe": "another",
    "anounced": "announced",
    "anoyed": "annoyed",
    "anphibian": "amphibian",
    "ansalisation": "nasalisation",
    "ansalization": "nasalization",
    "ansamble": "ensemble",
    "ansester": "ancestor",
    "antartic": "antarctic",
    "antartica": "Antarctica",
    "antecedant": "antecedent",
    "anthromorphization": "anthropomorphization",
    "anticdote": "anecdote",
    "anticlimatic": "anticlimactic",
    "antripanewer": "entrepreneur",
    "antropological": "anthropological",
    "antropologist": "anthropologist",
    "antropology": "anthropology",
    "anual": "annual",
    "anull": "annul",
    "anulled": "annulled",
    "anurism": "aneurysm",
    "anyhwere": "anywhere",
    "anythign": "anything",
    "anytying": "anything",
    "aparatus": "apparatus",
    "aparent": "apparent",
    "apartament": "apartment",
    "apartaments": "apartments",
    "apartement": "apartment",
    "apartements": "apartments",
    "apartide": "apartheid",
    "apauled": "appalled",
    "Apenines": "Apennines",
    "apihelion": "aphelion",
    "aplication": "application",
    "aplikay": "applique",
    "apolegetics": "apologetics",
    "apollstree": "upholstery",
    "apologise": "apologize",
    "apologised": "apologized",
    "aposle": "apostle",
    "aposles": "apostles",
    "apostraphe": "apostrophe",
    "apparant": "apparent",
    "apparantly": "apparently",
    "apparrent": "apparent",
    "appart": "apart",
    "appartament": "apartment",
    "appartaments": "apartments",
    "appartement": "apartment",
    "appartements": "apartments",
    "appartment": "apartment",
    "appartments": "apartments",
    "appathetic": "apathetic",
    "appearence": "appearance",
    "appearences": "appearances",
    "Appenines": "Apennines",
    "apperance": "appearance",
    "apperances": "appearances",
    "applicaiton": "application",
    "applicaitons": "applications",
    "applyed": "applied",
    "appointiment": "appointment",
    "appologies": "apologies",
    "appology": "apology",
    "apprieciate": "appreciate",
    "approachs": "approaches",
    "appropiate": "appropriate",
    "approrpiate": "appropriate",
    "approrpriate": "appropriate",
    "approximitely": "approximately",
    "apresheation": "appreciation",
    "aprox": "approx",
    "aproximate": "approximate",
    "aproximately": "approximately",
    "aproximatly": "approximately",
    "aquaduct": "aqueduct",
    "aquaducts": "aqueducts",
    "aquaintance": "acquaintance",
    "aquainted": "acquainted",
    "aqueus": "aqueous",
    "aquiantance": "acquaintance",
    "aquiess": "acquiesce",
    "aquire": "acquire",
    "aquired": "acquired",
    "aquiring": "acquiring",
    "aquisition": "acquisition",
    "aquisitions": "acquisitions",
    "aquit": "acquit",
    "aquitted": "acquitted",
    "ar": "are",
    "aracnid": "arachnid",
    "aranged": "arranged",
    "arangement": "arrangement",
    "arangements": "arrangements",
    "arbitarily": "arbitrarily",
    "arbitary": "arbitrary",
    "arbouretum": "arboretum",
    "archaelogic": "archaeologic",
    "archaelogical": "archaeological",
    "archaelogically": "archaeologically",
    "archaelogist": "archaeologist",
    "archaelogists": "archaeologists",
    "archaelogy": "archaeology",
    "archetect": "architect",
    "archetects": "architects",
    "archetectural": "architectural",
    "archetecturally": "architecturally",
    "archetecture": "architecture",
    "archiac": "archaic",
    "Archimedian": "Archimedean",
    "archipeligo": "archipelago",
    "archipilago": "archipelago",
    "archipiligo": "archipelago",
    "architechture": "architecture",
    "architecure": "architecture",
    "archtype": "archetype",
    "archtypes": "archetypes",
    "arcoss": "across",
    "ardvark": "aardvark",
    "argubly": "arguably",
    "argueably": "arguably",
    "arguebly": "arguably",
    "arguement": "argument",
    "arguements": "arguments",
    "arithmatic": "arithmetic",
    "arive": "arrive",
    "arived": "arrived",
    "armagedon": "Armageddon",
    "armistis": "armistice",
    "armorment": "armament",
    "aroara": "aurora",
    "arond": "around",
    "aroudn": "around",
    "arrangment": "arrangement",
    "arro": "arrow",
    "arround": "around",
    "Artic": "Arctic",
    "artical": "article",
    "artice": "article",
    "articel": "article",
    "artifical": "artificial",
    "artifically": "artificially",
    "artificila": "artificial",
    "artillary": "artillery",
    "artisit": "artist",
    "artisits": "artists",
    "aruond": "around",
    "asdvertising": "advertising",
    "asend": "ascend",
    "asended": "ascended",
    "asending": "ascending",
    "asetic": "ascetic",
    "asfalt": "asphalt",
    "ashphalt": "asphalt",
    "ashtma": "asthma",
    "asign": "assign",
    "asociate": "associate",
    "asociated": "associated",
    "asociation": "association",
    "asociations": "associations",
    "asorbed": "absorbed",
    "asosciate": "associate",
    "asosciated": "associated",
    "asosciation": "association",
    "asosciations": "associations",
    "asosiate": "associate",
    "asosiated": "associated",
    "asosiation": "association",
    "asosiations": "associations",
    "asperations": "aspirations",
    "aspestus": "asbestos",
    "assasin": "assassin",
    "assasinate": "assassinate",
    "assasinated": "assassinated",
    "assasinates": "assassinates",
    "assasination": "assassination",
    "assasinations": "assassinations",
    "assasins": "assassins",
    "assemalate": "assimilate",
    "assemple": "assemble",
    "assertation": "assertion",
    "assfalt": "asphalt",
    "asside": "aside",
    "assimtote": "asymptote",
    "assisstance": "assistance",
    "assistent": "assistant",
    "assitant": "assistant",
    "assma": "asthma",
    "assocation": "association",
    "assoicate": "associate",
    "assoicated": "associated",
    "assoicates": "associates",
    "assosciate": "associate",
    "assosciated": "associated",
    "assosciation": "association",
    "assosciations": "associations",
    "assosiate": "associate",
    "assosiated": "associated",
    "assosiation": "association",
    "assosiations": "associations",
    "assymetric": "asymmetric",
    "asterix": "asterisk",
    "asthetic": "aesthetic",
    "asthetics": "aesthetics",
    "astrix": "asterisk",
    "astroid": "asteroid",
    "asume": "assume",
    "asumtotic": "asymptotic",
    "atendant": "attendant",
    "atendants": "attendants",
    "atendent": "attendant",
    "atendents": "attendants",
    "atention": "attention",
    "aterny": "attorney",
    "athelete": "athlete",
    "atheletes": "athletes",
    "atheletic": "athletic",
    "atheltic": "athletic",
    "atheltics": "athletics",
    "Athenean": "Athenian",
    "Atheneans": "Athenians",
    "athiest": "atheist",
    "athmosphere": "atmosphere",
    "atol": "atoll",
    "atols": "atolls",
    "atomsphere": "atmosphere",
    "atractions": "attractions",
    "atribute": "attribute",
    "atributed": "attributed",
    "atributes": "attributes",
    "attatch": "attach",
    "attemp": "attempt",
    "attemt": "attempt",
    "attemted": "attempted",
    "attemting": "attempting",
    "attemts": "attempts",
    "attendence": "attendance",
    "attendent": "attendant",
    "attendents": "attendants",
    "attened": "attend",
    "attented": "attended",
    "attenting": "attending",
    "attentioin": "attention",
    "austeer": "austere",
    "authobiographic": "autobiographic",
    "authobiography": "autobiography",
    "authorative": "authoritative",
    "authorites": "authorities",
    "authoritive": "authoritative",
    "autochtonous": "autochthonous",
    "autoctonous": "autochthonous",
    "automaticly": "automatically",
    "automoton": "automaton",
    "autor": "author",
    "autotorium": "auditorium",
    "autum": "autumn",
    "auxilary": "auxiliary",
    "auxillaries": "auxiliaries",
    "auxillary": "auxiliary",
    "auxilliaries": "auxiliaries",
    "auxilliary": "auxiliary",
    "availabe": "available",
    "availalbe": "available",
    "availble": "available",
    "availiable": "available",
    "availible": "available",
    "avalable": "available",
    "avalance": "avalanche",
    "avaliable": "available",
    "avalible": "available",
    "avation": "aviation",
    "azma": "asthma",
    "bacame": "became",
    "bachler": "bachelor",
    "backaloriette": "baccalaureate",
    "backerie": "bakery",
    "backeries": "bakeries",
    "backery": "bakery",
    "backpeddle": "backpedal",
    "baclaureate": "baccalaureate",
    "Bagdad": "Baghdad",
    "bakc": "back",
    "balcon": "balcony",
    "balcons": "balconies",
    "balona": "bologna",
    "bandwith": "bandwidth",
    "bangquit": "banquet",
    "bankrupcy": "bankruptcy",
    "bannet": "bayonet",
    "baray": "beret",
    "baroke": "baroque",
    "barroque": "baroque",
    "batallion": "battalion",
    "bayge": "beige",
    "bazare": "bazaar",
    "beastiary": "bestiary",
    "beauquet": "bouquet",
    "beauracratic": "bureaucratic",
    "beaurocracy": "bureaucracy",
    "becuz": "because",
    "before hand": "beforehand",
    "begger": "beggar",
    "begginings": "beginning",
    "behavoir": "behavior",
    "behavour": "behavior",
    "behemouth": "behemoth",
    "bekfast": "breakfast",
    "beleagured": "beleaguered",
    "beleived": "believed",
    "beleives": "believes",
    "believeable": "believable",
    "bellond": "beyond",
    "bellweather": "bellwether",
    "belond": "beyond",
    "benefical": "beneficial",
    "beneficary": "beneficiary",
    "benefitting": "benefiting",
    "benificial": "beneficial",
    "benifit": "benefit",
    "benifits": "benefits",
    "benine": "benign",
    "Bernouilli": "Bernoulli",
    "beseiged": "besieged",
    "bichth": "bitch",
    "bicyles": "bicycles",
    "biggin": "begin",
    "bigginer": "beginner",
    "biggining": "beginning",
    "bigginning": "beginning",
    "biginer": "beginner",
    "bilateraly": "bilaterally",
    "bilion": "billion",
    "bilions": "billions",
    "binominal": "binomial",
    "biscut": "biscuit",
    "bited": "bit",
    "bivouacing": "bivouacking",
    "bivwack": "bivouac",
    "biyou": "bayou",
    "blaim": "blame",
    "blaimed": "blamed",
    "blitzkreig": "blitzkrieg",
    "boaring": "boring",
    "boganveelia": "bougainvillea",
    "bonjoure": "bonjour",
    "Bonnano": "Bonanno",
    "boodist": "Buddhist",
    "booe": "buoy",
    "boofay": "buffet",
    "boorjwazee": "bourgeoisie",
    "booteek": "boutique",
    "booyah": "boo-yah",
    "borgwasy": "bourgeoisie",
    "boundarys": "boundaries",
    "boundrys": "boundaries",
    "bouyancy": "buoyancy",
    "boxs": "boxes",
    "brew haha": "brouhaha",
    "brigdes": "bridges",
    "Britian": "Britain",
    "Brittain": "Britain",
    "broady": "broadly",
    "brocher": "brochure",
    "brocolee": "broccoli",
    "broge": "brogue",
    "brooz": "bruise",
    "brudda": "brother",
    "Buddists": "Buddhists",
    "Budhists": "Buddhists",
    "Budism": "Buddhism",
    "Budist": "Buddhist",
    "Budists": "Buddhists",
    "bufet": "buffet",
    "bufette": "buffet",
    "buffette": "buffet",
    "buidlings": "buildings",
    "builded": "built",
    "buldings": "buildings",
    "bulidings": "buildings",
    "bulliten": "bulletin",
    "bullyan": "bouillon",
    "bungalo": "bungalow",
    "bungalos": "bungalows",
    "burbon": "bourbon",
    "buritto": "burrito",
    "burittos": "burritos",
    "burjun": "burgeon",
    "buro": "bureau",
    "burzwah": "bourgeois",
    "butiful": "beautiful",
    "bve": "be",
    "byast": "biased",
    "bycicle": "bicycle",
    "bycycle": "bicycle",
    "bycycles": "bicycles",
    "cachup": "catchup",
    "CAD design": "CAD",
    "cafay": "cafe",
    "cafine": "caffeine",
    "calander": "calendar",
    "calanders": "calendars",
    "caldesack": "cul-de-sac",
    "calfes": "calves",
    "calfs": "calves",
    "Califronian": "Californian",
    "calliagraphic": "calligraphic",
    "callis": "callus",
    "callouses": "calluses",
    "caluclated": "calculated",
    "calulated": "calculated",
    "camabert": "Camembert",
    "Cambrige": "Cambridge",
    "camelion": "chameleon",
    "campains": "campaigns",
    "candidtaes": "candidates",
    "canew": "canoe",
    "canibus": "cannabis",
    "canidate": "candidate",
    "cannisters": "canisters",
    "cannonical": "canonical",
    "cannotation": "connotation",
    "cannotations": "connotations",
    "cantine": "canteen",
    "caperbility": "capability",
    "capter": "captor",
    "captialize": "capitalize",
    "captials": "capitals",
    "capucino": "cappuccino",
    "caraboo": "caribou",
    "caracteristic": "characteristic",
    "caracteristics": "characteristics",
    "carcus": "carcass",
    "Caribean": "Caribbean",
    "Carmalite": "Carmelite",
    "carniverous": "carnivorous",
    "carosel": "carousel",
    "carrear": "career",
    "carreer": "career",
    "Carribbean": "Caribbean",
    "Carribean": "Caribbean",
    "Carthagian": "Carthaginian",
    "cartilege": "cartilage",
    "cartilidge": "cartilage",
    "cartledge": "cartilage",
    "cartrige": "cartridge",
    "casette": "cassette",
    "cash money": "cash",
    "casion": "caisson",
    "cassawory": "cassowary",
    "cassete": "cassette",
    "cassim": "chasm",
    "cassowarry": "cassowary",
    "casted": "cast",
    "casulaties": "casualties",
    "casulaty": "casualty",
    "cataclism": "cataclysm",
    "catagories": "categories",
    "catapiller": "caterpillar",
    "catastrofy": "catastrophe",
    "catchip": "ketchup",
    "cathlic": "catholic",
    "caucusus": "Caucasus",
    "cavren": "cavern",
    "cayak": "kayak",
    "ceaser": "Caesar",
    "celcius": "Celsius",
    "cellabration": "celebration",
    "cematry": "cemetery",
    "cementary": "cemetery",
    "cemetarey": "cemetery",
    "cemetaries": "cemeteries",
    "cemitary": "cemetery",
    "cencus": "census",
    "centenial": "centennial",
    "centruies": "centuries",
    "cercomstance": "circumstance",
    "cerimonial": "ceremonial",
    "cerimonies": "ceremonies",
    "cerimonious": "ceremonious",
    "cerimony": "ceremony",
    "certainity": "certainty",
    "chalanging": "challenging",
    "chalenging": "challenging",
    "chalk full": "chock-full",
    "challanged": "challenged",
    "challanger": "challenger",
    "challanging": "challenging",
    "champain": "champagne",
    "Champange": "Champagne",
    "chandeleer": "chandelier",
    "chanegs": "changes",
    "changable": "changeable",
    "changeing": "changing",
    "changng": "changing",
    "charaterized": "characterized",
    "charector": "character",
    "chariman": "chairman",
    "charistics": "characteristics",
    "charizma": "charisma",
    "chassy": "chassis",
    "cheatta": "cheetah",
    "Checkoslovakia": "Czechoslovakia",
    "cheeta": "cheetah",
    "cheezburger": "cheeseburger",
    "chemicaly": "chemically",
    "childbird": "childbirth",
    "chimmeny": "chimney",
    "chinezse": "Chinese",
    "chocolot": "chocolate",
    "choise": "choice",
    "chosing": "choosing",
    "cielings": "ceilings",
    "Cincinatti": "Cincinnati",
    "Cincinnatti": "Cincinnati",
    "ciotee": "coyote",
    "cirtificate": "certificate",
    "cladded": "clad",
    "claded": "clad",
    "claerer": "clearer",
    "claimes": "claims",
    "clairvoiant": "clairvoyant",
    "claravoyant": "clairvoyant",
    "classic tradition": "tradition",
    "claustraphobia": "claustrophobia",
    "clearence": "clearance",
    "cleeshay": "cliche",
    "clinicaly": "clinically",
    "clip-art": "clipart",
    "cloisonay": "cloisonne",
    "cmptr": "computer",
    "coaless": "coalesce",
    "coalessense": "coalescence",
    "cockels": "cockles",
    "coerse": "coerce",
    "coersion": "coercion",
    "coffe": "coffee",
    "cogniscent": "cognizant",
    "cohabitating": "cohabiting",
    "coinside": "coincide",
    "coinsidence": "coincidence",
    "colaboration": "collaboration",
    "colapsing": "collapsing",
    "colateral": "collateral",
    "coleeg": "colleague",
    "colera": "cholera",
    "collectables": "collectibles",
    "collegate": "collegiate",
    "collegues": "colleagues",
    "collonies": "colonies",
    "collosal": "colossal",
    "coloseum": "colosseum",
    "comando": "commando",
    "comandos": "commandos",
    "comanies": "companies",
    "comback": "comeback",
    "combined together": "combined",
    "combintation": "combination",
    "comemmorate": "commemorate",
    "comemmorated": "commemorated",
    "comemmorates": "commemorates",
    "comemmorating": "commemorating",
    "comemmoration": "commemoration",
    "comemmorative": "commemorative",
    "comemorate": "commemorate",
    "comemorated": "commemorated",
    "comemorates": "commemorates",
    "comemorating": "commemorating",
    "comemoration": "commemoration",
    "comemorative": "commemorative",
    "comencement": "commencement",
    "comerant": "cormorant",
    "comercaily": "commercially",
    "comericaly": "commercially",
    "comision": "commission",
    "comisioned": "commissioned",
    "comisioner": "commissioner",
    "comisioning": "commissioning",
    "comisions": "commissions",
    "comissioned": "commissioned",
    "comissions": "commissions",
    "comitee": "committee",
    "comiting": "committing",
    "comitting": "committing",
    "commemerative": "commemorative",
    "commemmorate": "commemorate",
    "commemmorated": "commemorated",
    "commemmorates": "commemorates",
    "commemmorating": "commemorating",
    "commemmoration": "commemoration",
    "commemmorative": "commemorative",
    "commerate": "commemorate",
    "commerating": "commemorating",
    "commeration": "commemoration",
    "commerative": "commemorative",
    "commercaily": "commercially",
    "commericaly": "commercially",
    "commisioned": "commissioned",
    "commisions": "commissions",
    "committy": "committee",
    "communikay": "communique",
    "compairison": "comparison",
    "comparision": "comparison",
    "comparitive": "comparative",
    "comparitively": "comparatively",
    "compatabilities": "compatibilities",
    "compatability": "compatibility",
    "compatable": "compatible",
    "compatablities": "compatibilities",
    "compatablity": "compatibility",
    "compatiblities": "compatibilities",
    "compatiblity": "compatibility",
    "compeat": "compete",
    "compeeting": "competing",
    "competance": "competence",
    "competively": "competitively",
    "comphrehensive": "comprehensive",
    "complcated": "complicated",
    "complextion": "complexion",
    "complier": "compiler",
    "composate": "composite",
    "compresive": "compressive",
    "computre": "computer",
    "concatinate": "concatenate",
    "concecutive": "consecutive",
    "conceet": "conceit",
    "conceirge": "concierge",
    "concensus": "consensus",
    "conceous": "conscious",
    "conchus": "conscious",
    "concide": "coincide",
    "concidered": "considered",
    "concience": "conscience",
    "conferance": "conference",
    "confidental": "confidential",
    "confirmmation": "confirmation",
    "confrence": "conference",
    "confsued": "confused",
    "congresional": "congressional",
    "conived": "connived",
    "connexion": "connection",
    "conosuer": "connoisseur",
    "conotation": "connotation",
    "conquerer": "conqueror",
    "conquerers": "conquerors",
    "consdidered": "considered",
    "conseat": "conceit",
    "consentrated": "concentrated",
    "consept": "concept",
    "conservitive": "conservative",
    "consession": "concession",
    "consessions": "concessions",
    "consevible": "conceivable",
    "considerd": "considered",
    "considerit": "considerate",
    "consistancy": "consistency",
    "consituencies": "constituencies",
    "consituency": "constituency",
    "consitution": "constitution",
    "consitutional": "constitutional",
    "consolodate": "consolidate",
    "consolodated": "consolidated",
    "consonent": "consonant",
    "consonents": "consonants",
    "consorcium": "consortium",
    "constaints": "constraints",
    "constatn": "constant",
    "constituant": "constituent",
    "constituants": "constituents",
    "consulat": "consulate",
    "consumate": "consummate",
    "consumated": "consummated",
    "contagen": "contagion",
    "containes": "contains",
    "contamporaries": "contemporaries",
    "contamporary": "contemporary",
    "contemporaneus": "contemporaneous",
    "contempory": "contemporary",
    "contemprary": "contemporary",
    "continous": "continuous",
    "continously": "continuously",
    "continueing": "continuing",
    "continuem": "continuum",
    "contracter": "contractor",
    "contravercial": "controversial",
    "contraversy": "controversy",
    "contributer": "contributor",
    "contributers": "contributors",
    "controvercy": "controversy",
    "controveries": "controversies",
    "controvery": "controversy",
    "convenant": "covenant",
    "convense": "convince",
    "convential": "conventional",
    "convertion": "conversion",
    "convertors": "converters",
    "convetional": "conventional",
    "conviently": "conveniently",
    "convo": "conversation",
    "conyak": "cognac",
    "coo": "coup",
    "cooger": "cougar",
    "cookoo": "cuckoo",
    "coolot": "culottes",
    "coonservation": "conservation",
    "corale": "chorale",
    "coregated": "corrugated",
    "corosion": "corrosion",
    "corparate": "corporate",
    "corperate": "corporate",
    "corperation": "corporation",
    "corproations": "corporations",
    "correograph": "choreograph",
    "correponding": "corresponding",
    "correposding": "corresponding",
    "correspondant": "correspondent",
    "correspondants": "correspondents",
    "corrispond": "correspond",
    "corrispondant": "correspondent",
    "corrispondants": "correspondents",
    "corrisponded": "corresponded",
    "corrisponding": "corresponding",
    "corrisponds": "corresponds",
    "corruptable": "corruptible",
    "cosmipolitian": "cosmopolitan",
    "coud": "could",
    "coudl": "could",
    "cought": "caught",
    "counceling": "counseling",
    "councelling": "counseling",
    "counterfiets": "counterfeits",
    "countermessure": "countermeasure",
    "countermessures": "countermeasures",
    "courtain": "curtain",
    "cramugin": "curmudgeon",
    "cratashous": "cretaceous",
    "craziiest": "craziest",
    "creasoat": "creosote",
    "creater": "creator",
    "criteak": "critique",
    "critereon": "criterion",
    "criticists": "critics",
    "croch": "crotch",
    "crockadile": "crocodile",
    "cronological": "chronological",
    "crowkay": "croquet",
    "crowshay": "crochet",
    "crucifiction": "crucifixion",
    "cruse": "cruise",
    "crusies": "cruises",
    "cruze": "cruise",
    "cubburd": "cupboard",
    "culiminating": "culminating",
    "cumpus": "compass",
    "cumulatative": "cumulative",
    "cupon": "coupon",
    "curch": "church",
    "curnel": "colonel",
    "currenly": "currently",
    "curteus": "courteous",
    "curvasious": "curvaceous",
    "cusine": "cuisine",
    "cusotmers": "customers",
    "cutsomers": "customers",
    "cutted": "cut",
    "dabree": "debris",
    "dabue": "debut",
    "dackery": "daiquiri",
    "dail": "dial",
    "damenor": "demeanor",
    "Dardenelles": "Dardanelles",
    "daybue": "debut",
    "dead corpse": "corpse",
    "dealed": "dealt",
    "deatils": "details",
    "debateable": "debatable",
    "decathalon": "decathlon",
    "decend": "descend",
    "decendants": "descendants",
    "decended": "descended",
    "decendent": "descendant",
    "decendents": "descendants",
    "decending": "descending",
    "decends": "descends",
    "decideable": "decidable",
    "decidely": "decidedly",
    "decieved": "deceived",
    "deciple": "disciple",
    "decison": "decision",
    "decisons": "decisions",
    "decission": "decision",
    "decomposit": "decompose",
    "decomposited": "decomposed",
    "decompositing": "decomposing",
    "decomposits": "decomposes",
    "decribed": "described",
    "decribes": "describes",
    "decribing": "describing",
    "deep-seeded": "deep-seated",
    "deepo": "depot",
    "defecit": "deficit",
    "defendent": "defendant",
    "definance": "defiance",
    "defineable": "definable",
    "definit": "definite",
    "definite decision": "decision",
    "defishant": "deficient",
    "degress": "degrees",
    "delapidated": "dilapidated",
    "delcared": "declared",
    "delienation": "delineation",
    "delimeter": "delimiter",
    "delimma": "dilemma",
    "delux": "deluxe",
    "demarkation": "demarcation",
    "demenor": "demeanor",
    "demographical": "demographic",
    "denegrating": "denigrating",
    "deparments": "departments",
    "dependancy": "dependency",
    "dependant": "dependent",
    "derageable": "dirigible",
    "deriair": "derriere",
    "derivated": "derived",
    "deriviated": "derived",
    "deriviative": "derivative",
    "derogitory": "derogatory",
    "derrogative": "derogative",
    "derth": "dearth",
    "descend down": "descend",
    "descendent": "descendant",
    "descendents": "descendants",
    "descision": "decision",
    "descisions": "decisions",
    "descize": "disguise",
    "desgined": "designed",
    "desicion": "decision",
    "desicions": "decisions",
    "desided": "decided",
    "desintegrated": "disintegrated",
    "desintegration": "disintegration",
    "desision": "decision",
    "desisions": "decisions",
    "deskys": "disguise",
    "desolve": "dissolve",
    "desparation": "desperation",
    "despiration": "desperation",
    "dessicated": "desiccated",
    "dessication": "desiccation",
    "dessigned": "designed",
    "detatchment": "detachment",
    "determinining": "determining",
    "detremental": "detrimental",
    "detur": "detour",
    "deturance": "deterrence",
    "Deutschland": "Germany",
    "devasting": "devastating",
    "develeoprs": "developers",
    "develloped": "developed",
    "develloper": "developer",
    "devellopers": "developers",
    "develloping": "developing",
    "devellopment": "development",
    "devellopments": "developments",
    "devellops": "develop",
    "developement": "development",
    "developements": "developments",
    "developemet": "development",
    "developor": "developer",
    "developors": "developers",
    "developped": "developed",
    "develpment": "development",
    "devestating": "devastating",
    "devide": "divide",
    "devided": "divided",
    "devistated": "devastated",
    "devistating": "devastating",
    "devistation": "devastation",
    "devolopement": "development",
    "dezert": "dessert",
    "diad": "dyad",
    "diadic": "dyadic",
    "dialation": "dilation",
    "diarea": "diarrhea",
    "diaster": "disaster",
    "dicision": "decision",
    "dicotomy": "dichotomy",
    "dicovered": "discovered",
    "dicovering": "discovering",
    "dicovers": "discovers",
    "dicovery": "discovery",
    "dieing": "dying",
    "diesal": "diesel",
    "dieties": "deities",
    "diferences": "differences",
    "difernt": "different",
    "different variation": "variation",
    "dificulties": "difficulties",
    "difrent": "different",
    "digged": "dug",
    "dilipidated": "dilapidated",
    "dimand": "diamond",
    "dimenions": "dimensions",
    "dimention": "dimension",
    "dimentional": "dimensional",
    "dimentions": "dimensions",
    "diminuation": "diminution",
    "diminuative": "diminutive",
    "diminuition": "diminution",
    "diminuitive": "diminutive",
    "dioreha": "diarrhea",
    "diphtong": "diphthong",
    "diphtongs": "diphthongs",
    "diptheria": "diphtheria",
    "dipthong": "diphthong",
    "dipthongs": "diphthongs",
    "directlty": "directly",
    "directoins": "directions",
    "dirived": "derived",
    "disapait": "dissipate",
    "disaproval": "disapproval",
    "disasterous": "disastrous",
    "discimenation": "dissemination",
    "discoverd": "discovered",
    "discribed": "described",
    "discribing": "describing",
    "discription": "description",
    "disctinction": "distinction",
    "disection": "dissection",
    "disemination": "dissemination",
    "disobediance": "disobedience",
    "disolved": "dissolved",
    "disorientated": "disoriented",
    "disparingly": "disparagingly",
    "dispenced": "dispensed",
    "dispencing": "dispensing",
    "dispite": "despite",
    "dissapearance": "disappearance",
    "dissarray": "disarray",
    "dissecated": "desiccated",
    "dissepearing": "disappearing",
    "dissobediance": "disobedience",
    "dissobedience": "disobedience",
    "dissonent": "dissonant",
    "distingishes": "distinguishes",
    "distribusion": "distribution",
    "distruction": "destruction",
    "divice": "device",
    "divisons": "divisions",
    "dockson": "dachshund",
    "docsund": "dachshund",
    "documnets": "documents",
    "doens": "does",
    "doenst": "does not",
    "doese": "does",
    "doign": "doing",
    "doimg": "doing",
    "doin": "doing",
    "doind": "doing",
    "dolars": "dollars",
    "donejun": "dungeon",
    "donig": "doing",
    "dood": "dude",
    "doorjam": "doorjamb",
    "dophinarium": "dolphinarium",
    "dorment": "dormant",
    "DOS operating system": "DOS",
    "doublely": "doubly",
    "dout": "doubt",
    "downward descent": "descent",
    "Dravadian": "Dravidian",
    "dreasm": "dreams",
    "drinked": "drank",
    "drowt": "drought",
    "drugist": "druggist",
    "drugists": "druggists",
    "drumer": "drummer",
    "dukeship": "dukedom",
    "dum": "dumb",
    "dyas": "dryas",
    "eary": "eerie",
    "easeily": "easily",
    "easly": "easily",
    "easyly": "easily",
    "ecidious": "deciduous",
    "ect": "etc",
    "eczecutive": "executive",
    "edeycat": "etiquette",
    "edfice": "edifice",
    "editting": "editing",
    "eeger": "eager",
    "eejus": "aegis",
    "eeked": "eked",
    "eeks": "ekes",
    "effeciency": "efficiency",
    "efficency": "efficiency",
    "effulence": "effluence",
    "efort": "effort",
    "eforts": "efforts",
    "ehr": "her",
    "eigth": "eighth",
    "Ekammai": "Ekamai",
    "Ekkamai": "Ekamai",
    "Ekkammai": "Ekamai",
    "electorial": "electoral",
    "electricly": "electrically",
    "eleminated": "eliminated",
    "eleminating": "eliminating",
    "eles": "eels",
    "elicided": "elicited",
    "eligability": "eligibility",
    "eligable": "eligible",
    "embalance": "imbalance",
    "embaras": "embarrass",
    "embarased": "embarrassed",
    "embarasing": "embarrassing",
    "embarasment": "embarrassment",
    "embarassment": "embarrassment",
    "embarrasment": "embarrassment",
    "embbaras": "embarrass",
    "embbarasing": "embarrassing",
    "embbarasment": "embarrassment",
    "embbarassment": "embarrassment",
    "embbarrasment": "embarrassment",
    "embbarrassment": "embarrassment",
    "embezelled": "embezzled",
    "emense": "immense",
    "emision": "emission",
    "emmediately": "immediately",
    "emmigrated": "emigrated",
    "emmigration": "emigration",
    "emmisaries": "emissaries",
    "emmisarries": "emissaries",
    "emmisarry": "emissary",
    "emmisary": "emissary",
    "emmision": "emission",
    "emmission": "emission",
    "emmitted": "emitted",
    "emmitting": "emitting",
    "emnity": "enmity",
    "empahsis": "emphasis",
    "empahsize": "emphasize",
    "empass": "impasse",
    "empede": "impede",
    "emperical": "empirical",
    "emphysyma": "emphysema",
    "empound": "impound",
    "empoundment": "impoundment",
    "empressed": "impressed",
    "enamoured": "enamored",
    "enchancement": "enhancement",
    "encompus": "encompass",
    "encorperate": "incorporate",
    "encorporate": "incorporate",
    "encryptiion": "encryption",
    "endolithes": "endoliths",
    "endur": "endure",
    "enforcment": "enforcement",
    "enimies": "enemies",
    "enlargment": "enlargement",
    "enlargments": "enlargements",
    "enormass": "enormous",
    "entent": "intent",
    "enterence": "entrance",
    "enterences": "entrances",
    "enthusiest": "enthusiast",
    "enthusiests": "enthusiasts",
    "entraces": "entrances",
    "entrapeneur": "entrepreneur",
    "entrepeneur": "entrepreneur",
    "entrepeneurs": "entrepreneurs",
    "enuf": "enough",
    "enviorment": "environment",
    "enviormental": "environmental",
    "enviormentally": "environmentally",
    "enviorments": "environments",
    "enviornments": "environments",
    "enviroments": "environments",
    "envoke": "invoke",
    "eqiped": "equipped",
    "eqipped": "equipped",
    "eqivalant": "equivalent",
    "eqivalants": "equivalents",
    "eqivalent": "equivalent",
    "eqivalents": "equivalents",
    "eqivelant": "equivalent",
    "eqivelants": "equivalents",
    "eqivelent": "equivalent",
    "eqivelents": "equivalents",
    "eqivilant": "equivalent",
    "eqivilants": "equivalents",
    "eqivilent": "equivalent",
    "eqivilents": "equivalents",
    "equilibium": "equilibrium",
    "equilibrum": "equilibrium",
    "equiped": "equipped",
    "equippment": "equipment",
    "equitorial": "equatorial",
    "equivalant": "equivalent",
    "equivalants": "equivalents",
    "equivelant": "equivalent",
    "equivelants": "equivalents",
    "equivelent": "equivalent",
    "equivelents": "equivalents",
    "equivilant": "equivalent",
    "equivilants": "equivalents",
    "equivilent": "equivalent",
    "equivilents": "equivalents",
    "eratic": "erratic",
    "eraticly": "erratically",
    "Esam": "Isaan",
    "essense": "essence",
    "essential necessity": "necessity",
    "esthetic": "aesthetic",
    "estuwarry": "estuary",
    "ettiquette": "etiquette",
    "euphamism": "euphemism",
    "eventfull": "eventful",
    "everythign": "everything",
    "evidentally": "evidently",
    "exagerate": "exaggerate",
    "exagerated": "exaggerated",
    "exagerates": "exaggerates",
    "exagerating": "exaggerating",
    "exagerrate": "exaggerate",
    "exagerrated": "exaggerated",
    "exagerrates": "exaggerates",
    "exagerrating": "exaggerating",
    "exasparated": "exasperated",
    "excecuted": "executed",
    "excecuting": "executing",
    "excecution": "execution",
    "excedded": "exceeded",
    "excell": "excel",
    "excells": "excels",
    "exchagnes": "exchanges",
    "exelent": "excellent",
    "exerbate": "exacerbate",
    "exerbated": "exacerbated",
    "exerpt": "excerpt",
    "exerpts": "excerpts",
    "exerternal": "external",
    "exhcanges": "exchanges",
    "exhibiton": "exhibition",
    "exhibitons": "exhibitions",
    "exibition": "exhibition",
    "exibitions": "exhibitions",
    "exibits": "exhibits",
    "exilerate": "exhilarate",
    "existant": "existent",
    "exoskelaton": "exoskeleton",
    "expatriot": "expatriate",
    "experianced": "experienced",
    "experinced": "experienced",
    "explaination": "explanation",
    "explainations": "explanations",
    "explination": "explanation",
    "exploitate": "exploit",
    "exprienced": "experienced",
    "exsist": "exist",
    "exsistance": "existence",
    "exstacy": "ecstasy",
    "extered": "exerted",
    "extraterrestials": "extraterrestrials",
    "extremeophile": "extremophile",
    "extrodinary": "extraordinary",
    "extrordinarily": "extraordinarily",
    "exurpt": "excerpt",
    "eye brow": "eyebrow",
    "eye lash": "eyelash",
    "eye lid": "eyelid",
    "eye sight": "eyesight",
    "eye sore": "eyesore",
    "eyse": "eyes",
    "ezdrop": "eavesdrop",
    "facilaties": "facilities",
    "facilaty": "facility",
    "faciliate": "facilitate",
    "faciliated": "facilitated",
    "facilites": "facilities",
    "facilties": "facilities",
    "fairoh": "pharaoh",
    "falic": "phallic",
    "fallic": "phallic",
    "falt": "fault",
    "familair": "familiar",
    "familar": "familiar",
    "familliar": "familiar",
    "fammiliar": "familiar",
    "fane": "feign",
    "farenheit": "Fahrenheit",
    "farenheight": "Fahrenheit",
    "farmasudical": "pharmaceutical",
    "farse": "farce",
    "fascitious": "facetious",
    "faseeshus": "facetious",
    "fasen": "fasten",
    "fasend": "fastened",
    "fasodd": "facade",
    "fatig": "fatigue",
    "favorable approval": "approval",
    "favorirte": "favorite",
    "feasability": "feasibility",
    "feasable": "feasible",
    "Febewary": "February",
    "feilds": "fields",
    "fench": "French",
    "feonsay": "fiancee",
    "feromone": "pheromone",
    "fettucini": "fettuccini",
    "fetuccini": "fettuccini",
    "fewd": "feud",
    "fewsha": "fuchsia",
    "fezent": "pheasant",
    "fibrant": "vibrant",
    "ficks": "fix",
    "ficticious": "fictitious",
    "fictious": "fictitious",
    "fighted": "fought",
    "figuers": "figures",
    "figure head": "figurehead",
    "filiament": "filament",
    "fillement": "filament",
    "filmaker": "filmmaker",
    "filmaking": "filmmaking",
    "filo": "phyllo",
    "financialy": "financially",
    "finess": "finesse",
    "finly": "finely",
    "finness": "finesse",
    "firends": "friends",
    "firts": "first",
    "fistfull": "fistful",
    "fistfulls": "fistfuls",
    "fizeek": "physique",
    "flag ship": "flagship",
    "flatrate": "flat rate",
    "flem": "phlegm",
    "Flemmish": "Flemish",
    "floatation": "flotation",
    "floresent": "fluorescent",
    "floride": "fluoride",
    "flouride": "fluoride",
    "flourine": "fluorine",
    "flud": "flood",
    "focusses": "focuses",
    "foilage": "foliage",
    "fonetic": "phonetic",
    "foolded": "fooled",
    "forbad": "forbade",
    "forbatum": "verbatim",
    "forboding": "foreboding",
    "forcast": "forecast",
    "forcasted": "forecast",
    "forcasts": "forecasts",
    "forceably": "forcibly",
    "forclosure": "foreclosure",
    "forecasted": "forecast",
    "forefieture": "forfeiture",
    "forfieture": "forfeiture",
    "forin": "foreign",
    "Formalhaut": "Fomalhaut",
    "formely": "formerly",
    "formost": "foremost",
    "forrests": "forests",
    "forsee": "foresee",
    "forseeability": "foreseeability",
    "forseeable": "foreseeable",
    "forseen": "foreseen",
    "forsight": "foresight",
    "fortell": "foretell",
    "forthe": "for",
    "fortrice": "fortress",
    "forunner": "forerunner",
    "foudn": "found",
    "fougth": "fought",
    "foundaries": "foundries",
    "foundary": "foundry",
    "Foundland": "Newfoundland",
    "fourty": "forty",
    "frae": "from",
    "Fransiscan": "Franciscan",
    "Fransiscans": "Franciscans",
    "freinds": "friends",
    "frends": "friends",
    "friendlyness": "friendliness",
    "frinds": "friends",
    "frm": "from",
    "frmo": "from",
    "fron": "from",
    "funary": "funerary",
    "fundametals": "fundamentals",
    "furneral": "funeral",
    "fusha": "fuchsia",
    "futal": "futile",
    "futher": "further",
    "gaems": "games",
    "gaints": "giants",
    "galatic": "galactic",
    "Galations": "Galatians",
    "galery": "gallery",
    "ganster": "gangster",
    "garanteed": "guaranteed",
    "garantees": "guarantees",
    "gard": "guard",
    "gastly": "ghastly",
    "gauranteed": "guaranteed",
    "gaurantees": "guarantees",
    "gaurenteed": "guaranteed",
    "gayity": "gaiety",
    "gaysha": "geisha",
    "geeotine": "guillotine",
    "geneological": "genealogical",
    "geneologies": "genealogies",
    "genialia": "genitalia",
    "geografically": "geographically",
    "geometricians": "geometers",
    "gerilla": "guerrilla",
    "gerkin": "gherkin",
    "gerkins": "gherkins",
    "gess": "guess",
    "getoe": "ghetto",
    "gilotine": "guillotine",
    "ginee": "guinea",
    "girated": "gyrated",
    "girates": "gyrates",
    "girating": "gyrating",
    "giration": "gyration",
    "giser": "geyser",
    "gladiatiorial": "gladiatorial",
    "glas": "glass",
    "glases": "glasses",
    "glyserin": "glycerin",
    "goddes": "goddess",
    "godess": "goddess",
    "Godounov": "Godunov",
    "gool": "ghoul",
    "gord": "gourd",
    "gormay": "gourmet",
    "gossipping": "gossiping",
    "gost": "ghost",
    "gotee": "goatee",
    "Gothenberg": "Gothenburg",
    "Gottleib": "Gottlieb",
    "gouvener": "governor",
    "govermental": "governmental",
    "goverments": "governments",
    "govoner": "governor",
    "govorment": "government",
    "govormental": "governmental",
    "grainery": "granary",
    "gramatically": "grammatically",
    "grammaticaly": "grammatically",
    "grammer": "grammar",
    "grandeeos": "grandiose",
    "granjure": "grandeur",
    "gratuitious": "gratuitous",
    "Greecian": "Grecian",
    "grimey": "grimy",
    "groosome": "gruesome",
    "groosum": "gruesome",
    "groseries": "groceries",
    "groshury": "grocery",
    "groth": "growth",
    "growtesk": "grotesque",
    "gruops": "groups",
    "grwo": "grow",
    "guarenteed": "guaranteed",
    "gubnatorial": "gubernatorial",
    "guerillas": "guerrillas",
    "gues": "guess",
    "guidence": "guidance",
    "guidlines": "guidelines",
    "Guilia": "Giulia",
    "Guiliani": "Giuliani",
    "Guilio": "Giulio",
    "Guiness": "Guinness",
    "Guinnes": "Guinness",
    "Guiseppe": "Giuseppe",
    "gunanine": "guanine",
    "guranteed": "guaranteed",
    "gurantees": "guarantees",
    "gurkin": "gherkin",
    "guttaral": "guttural",
    "gutteral": "guttural",
    "gwava": "guava",
    "gymnist": "gymnast",
    "h4wt": "sexy",
    "habaeus": "habeas",
    "habitants": "inhabitants",
    "Habsbourg": "Habsburg",
    "hace": "hare",
    "hagas": "haggis",
    "halfways": "halfway",
    "hallaluja": "hallelujah",
    "hallaluya": "hallelujah",
    "haltet": "halted",
    "handywork": "handiwork",
    "haneous": "heinous",
    "hankerchif": "handkerchief",
    "hansome": "handsome",
    "hapens": "happens",
    "harases": "harasses",
    "harasment": "harassment",
    "harasments": "harassments",
    "harras": "harass",
    "harrased": "harassed",
    "harrases": "harasses",
    "harrasing": "harassing",
    "harrasment": "harassment",
    "harrasments": "harassments",
    "harrasses": "harassed",
    "harrassing": "harass",
    "harrassment": "harassment",
    "harrassments": "harassments",
    "harth": "hearth",
    "hauty": "haughty",
    "Havaii": "Hawaii",
    "hawt": "sexy",
    "hazerd": "hazard",
    "hazerdous": "hazardous",
    "headquater": "headquarter",
    "headquatered": "headquartered",
    "hefer": "heifer",
    "Heidelburg": "Heidelberg",
    "heigthen": "heighten",
    "heigthened": "heightened",
    "heigths": "heights",
    "heigthten": "heighten",
    "heigthtened": "heightened",
    "heirarchy": "hierarchy",
    "heiroglyphics": "hieroglyphics",
    "heithten": "heighten",
    "heithtened": "heightened",
    "hemiphere": "hemisphere",
    "hemorage": "hemorrhage",
    "henderence": "hindrance",
    "heptathalon": "heptathlon",
    "heroe": "hero",
    "hersuit": "hirsute",
    "hersute": "hirsute",
    "hge": "he",
    "hieghten": "heighten",
    "hieghtened": "heightened",
    "hieghts": "heights",
    "hierachical": "hierarchical",
    "hierachies": "hierarchies",
    "hierachy": "hierarchy",
    "hierarcical": "hierarchical",
    "hierarcy": "hierarchy",
    "hieroglph": "hieroglyph",
    "hieroglphs": "hieroglyphs",
    "hietus": "hiatus",
    "higer": "higher",
    "higest": "highest",
    "highrise": "high-rise",
    "highten": "heighten",
    "highteneded": "heightened",
    "hinderance": "hindrance",
    "hinderence": "hindrance",
    "hindrence": "hindrance",
    "hipopotamus": "hippopotamus",
    "hirearcy": "hierarchy",
    "hirsuit": "hirsute",
    "hismelf": "himself",
    "histocompatability": "histocompatibility",
    "historicaly": "historically",
    "hitchiker": "hitchhiker",
    "hitchikers": "hitchhikers",
    "hitchiking": "hitchhiking",
    "hitted": "hit",
    "hobbiest": "hobbyist",
    "hoeks": "hoax",
    "hollistic": "holistic",
    "Holloween": "Halloween",
    "homogenity": "homogeneity",
    "honory": "honorary",
    "honourarium": "honorarium",
    "honourary": "honorary",
    "honourific": "honorific",
    "hoocker": "hooker",
    "hootsbah": "chutzpah",
    "hott": "sexy",
    "house-mate": "housemate",
    "hsi": "his",
    "htey": "they",
    "htikn": "think",
    "hting": "thing",
    "htp": "http",
    "humoural": "humoral",
    "huristic": "heuristic",
    "hyatus": "hiatus",
    "hydropilic": "hydrophilic",
    "hydropobe": "hydrophobe",
    "hydropobic": "hydrophobic",
    "hygeinic": "hygienic",
    "hygeinically": "hygienically",
    "hygenically": "hygienically",
    "hygine": "hygiene",
    "hyginic": "hygienic",
    "hyginically": "hygienically",
    "hypocracy": "hypocrisy",
    "hypocrasy": "hypocrisy",
    "hypocricy": "hypocrisy",
    "hypocrit": "hypocrite",
    "hypocrits": "hypocrites",
    "icesickle": "icicle",
    "iconclastic": "iconoclastic",
    "idae": "idea",
    "idaes": "ideas",
    "idealogies": "ideologies",
    "ideosincracy": "idiosyncrasy",
    "ideosyncratic": "idiosyncratic",
    "Ihaca": "Ithaca",
    "ihs": "his",
    "iin": "in",
    "ilegle": "illegal",
    "illegimacy": "illegitimacy",
    "illegitmate": "illegitimate",
    "illigitament": "illegitimate",
    "ilogical": "illogical",
    "ilumination": "illumination",
    "imaturity": "immaturity",
    "imbaress": "embarrass",
    "imediate": "immediate",
    "imediately": "immediately",
    "imediatly": "immediately",
    "imense": "immense",
    "imigrants": "immigrants",
    "immediatelly": "immediately",
    "immediatley": "immediately",
    "immediatly": "immediately",
    "immediete": "immediate",
    "immedietely": "immediately",
    "immenantly": "eminently",
    "immidately": "immediately",
    "immidiate": "immediate",
    "immidiately": "immediately",
    "immitating": "imitating",
    "immitator": "imitator",
    "immunosupressant": "immunosuppressant",
    "immuntable": "immutable",
    "impedence": "impedance",
    "imperic": "empiric",
    "imperically": "empirically",
    "impession": "impression",
    "important essentials": "essentials",
    "impromtu": "impromptu",
    "improvemnt": "improvement",
    "improvision": "improvisation",
    "improvment": "improvement",
    "impune": "impugn",
    "in side": "inside",
    "in tact": "intact",
    "inaccesabele": "inaccessible",
    "inaccessabele": "inaccessible",
    "inacesabel": "inaccessible",
    "inacesabele": "inaccessible",
    "inacesable": "inaccessible",
    "inacesibel": "inaccessible",
    "inacesibele": "inaccessible",
    "inacesible": "inaccessible",
    "inacessabel": "inaccessible",
    "inacessabele": "inaccessible",
    "inaugures": "inaugurates",
    "inbalanced": "imbalanced",
    "inbankment": "embankment",
    "incidently": "incidentally",
    "incompatabilities": "incompatibilities",
    "incompatability": "incompatibility",
    "incompatable": "incompatible",
    "incompatablities": "incompatibilities",
    "incompatablity": "incompatibility",
    "incompatiblities": "incompatibilities",
    "incompatiblity": "incompatibility",
    "incompetance": "incompetence",
    "inconsistancy": "inconsistency",
    "incorperation": "incorporation",
    "incorruptable": "incorruptible",
    "incourage": "encourage",
    "incredably": "incredibly",
    "incumbancy": "incumbency",
    "incumbant": "incumbent",
    "incunabla": "Incunabula",
    "indenpendence": "independence",
    "indepedantly": "independently",
    "indepedence": "independence",
    "independance": "independence",
    "independant": "independent",
    "independece": "independence",
    "indever": "endeavor",
    "indicitive": "indicative",
    "indisputible": "indisputable",
    "indisputibly": "indisputably",
    "indurance": "endurance",
    "indure": "endure",
    "inevatible": "inevitable",
    "inevitible": "inevitable",
    "inexhaustable": "inexhaustible",
    "infanty": "infantry",
    "infectuous": "infectious",
    "inferrable": "inferable",
    "infilitrate": "infiltrate",
    "infilitrated": "infiltrated",
    "inflamation": "inflammation",
    "influented": "influenced",
    "infrastucture": "infrastructure",
    "ingorance": "ignorance",
    "ingrediant": "ingredient",
    "ingrediants": "ingredients",
    "ingreediants": "ingredients",
    "inhabbitant": "inhabitant",
    "inhabitent": "inhabitant",
    "inhabitents": "inhabitants",
    "inheratance": "inheritance",
    "Inidan": "indian",
    "initation": "initiation",
    "inlcudes": "includes",
    "innosense": "innocence",
    "innundated": "inundated",
    "innundation": "inundation",
    "inocence": "innocence",
    "inprisonment": "imprisonment",
    "inquierer": "inquirer",
    "inseperable": "inseparable",
    "insepsion": "inception",
    "insistance": "insistence",
    "insiting": "insisting",
    "insitution": "institution",
    "insitutions": "institutions",
    "instalations": "installations",
    "instaleld": "installed",
    "instanciation": "instantiation",
    "instanseation": "instantiation",
    "instatance": "instance",
    "instict": "instinct",
    "instuctors": "instructors",
    "insue": "ensue",
    "inteligable": "intelligible",
    "intelligensia": "intelligentsia",
    "interchangable": "interchangeable",
    "interchangably": "interchangeably",
    "interelated": "interrelated",
    "interfearance": "interference",
    "interferance": "interference",
    "intergral": "integral",
    "intergrated": "integrated",
    "intergration": "integration",
    "internation": "international",
    "internationaly": "internationally",
    "interpet": "interpret",
    "interpretate": "interpret",
    "interrugum": "interregnum",
    "interrum": "interim",
    "interruptable": "interruptible",
    "intertaining": "entertaining",
    "interum": "interim",
    "interuption": "interruption",
    "intervall": "interval",
    "intervalls": "intervals",
    "intesection": "intersection",
    "intesections": "intersections",
    "intreeg": "intrigue",
    "intrepetation": "interpretation",
    "intruiging": "intriguing",
    "inturpratasion": "interpretation",
    "inturprett": "interpret",
    "invitiation": "invitation",
    "invokation": "invocation",
    "involvment": "involvement",
    "irelevent": "irrelevant",
    "iresistably": "irresistibly",
    "iresistibly": "irresistibly",
    "ironicly": "ironically",
    "irresistably": "irresistibly",
    "Isan": "Isaan",
    "ISDN network": "ISDN",
    "ismas": "isthmus",
    "Issan": "Isaan",
    "it self": "itself",
    "itenerant": "itinerant",
    "itinaries": "itineraries",
    "itinary": "itinerary",
    "itinarys": "itineraries",
    "itinerarys": "itineraries",
    "itineries": "itineraries",
    "itineriries": "itineraries",
    "itineriry": "itinerary",
    "itinerirys": "itineraries",
    "itinery": "itinerary",
    "itinerys": "itineraries",
    "itiniraries": "itineraries",
    "itinirary": "itinerary",
    "itinirarys": "itineraries",
    "ititial": "initial",
    "itnerests": "interests",
    "iz": "is",
    "jagid": "jagged",
    "jagwar": "jaguar",
    "jalusey": "jalousie",
    "jeapardy": "jeopardy",
    "jewelery": "jewelry",
    "jewellry": "jewelry",
    "jodpers": "jodhpurs",
    "Johanine": "Johannine",
    "Jospeh": "Joseph",
    "journie": "journey",
    "journies": "journeys",
    "jstu": "just",
    "judgement": "judgment",
    "judical": "judicial",
    "judisuary": "judiciary",
    "jugment": "judgment",
    "jurny": "journey",
    "kackie": "khaki",
    "kalidescope": "kaleidoscope",
    "keesh": "quiche",
    "keyosk": "kiosk",
    "kibutz": "kibbutz",
    "killed dead": "killed",
    "killerwhale": "killer",
    "killerwhales": "killer",
    "kilometres": "kilometers",
    "kiloohm": "kilohm",
    "kiloohms": "kilohms",
    "kitty": "kitten",
    "kiyack": "kayak",
    "knifes": "knives",
    "knockous": "noxious",
    "knowlegable": "knowledgeable",
    "knwo": "know",
    "knwos": "knows",
    "konws": "knows",
    "kool": "cool",
    "koolot": "culottes",
    "kresh": "creche",
    "kronicle": "chronicle",
    "kwuzine": "cuisine",
    "labelled": "labeled",
    "lable": "label",
    "labled": "labeled",
    "labourious": "laborious",
    "labrynth": "labyrinth",
    "lackluster": "lacklustre",
    "laf": "laugh",
    "laguages": "languages",
    "laise": "liaise",
    "lama": "llama",
    "lambast": "lambaste",
    "langerray": "lingerie",
    "lanscapes": "landscapes",
    "larggest": "largest",
    "largst": "largest",
    "lasonya": "lasagna",
    "latern": "lantern",
    "laterns": "lanterns",
    "laughing stock": "laughingstock",
    "launchpad": "launch",
    "lavae": "larvae",
    "law suite": "lawsuit",
    "layed": "laid",
    "lazer": "laser",
    "lazers": "lasers",
    "leaneant": "lenient",
    "leeg": "league",
    "leetspeek": "leet speak",
    "legionair": "legionnaire",
    "leisurly": "leisurely",
    "leprecan": "leprechaun",
    "lerans": "learns",
    "lesbein": "lesbian",
    "levetate": "levitate",
    "levetated": "levitated",
    "levetates": "levitates",
    "levetating": "levitating",
    "lew": "lieu",
    "lewchemia": "leukemia",
    "lewow": "luau",
    "Lexion": "lexicon",
    "liais": "liaise",
    "liase": "liaise",
    "liason": "liaison",
    "libary": "library",
    "libguistic": "linguistic",
    "licker": "liquor",
    "lieing": "lying",
    "liek": "like",
    "liev": "live",
    "ligitamassy": "legitimacy",
    "ligitamate": "legitimate",
    "likelyhood": "likelihood",
    "liklihood": "likelihood",
    "limitated": "limited",
    "liqeur": "liqueur",
    "liqours": "liquors",
    "liquers": "liquors",
    "liscence": "licence",
    "litature": "literature",
    "literaly": "literally",
    "loacted": "located",
    "lonelyness": "loneliness",
    "long litany": "litany",
    "longtail": "long-tail",
    "longtailed": "long-tailed",
    "longtails": "long-tails",
    "loosly": "loosely",
    "lozonya": "lasagna",
    "lucatrative": "lucrative",
    "lugage": "luggage",
    "lushis": "luscious",
    "lveo": "love",
    "Lybia": "Libya",
    "macack": "macaque",
    "macason": "moccasin",
    "machettie": "machete",
    "mackeral": "mackerel",
    "magicaly": "magically",
    "magolia": "magnolia",
    "mailstrum": "maelstrom",
    "maintainance": "maintenance",
    "maintainence": "maintenance",
    "maintance": "maintenance",
    "maintioned": "mentioned",
    "majiscule": "majuscule",
    "Makkah": "Mecca",
    "makse": "makes",
    "maline": "malign",
    "malless": "malice",
    "maltesian": "Maltese",
    "mamal": "mammal",
    "mamalian": "mammalian",
    "mamuth": "mammoth",
    "managged": "managed",
    "manaise": "mayonnaise",
    "manaze": "mayonnaise",
    "manikin": "mannequin",
    "manufaturing": "manufacturing",
    "manuver": "maneuver",
    "Marixist": "Marxist",
    "marjority": "majority",
    "markey": "marquee",
    "Maroccan": "Moroccan",
    "marshmellow": "marshmallow",
    "Marsielle": "Marseille",
    "marter": "martyr",
    "marz": "Mars",
    "masakist": "masochist",
    "mashetty": "machete",
    "masia": "messiah",
    "masicer": "massacre",
    "maskeraid": "masquerade",
    "massectomy": "mastectomy",
    "massewer": "masseur",
    "massoose": "masseuse",
    "matchs": "matches",
    "matheticians": "mathematicians",
    "mathmaticians": "mathematicians",
    "matinay": "matinee",
    "mattreses": "mattresses",
    "mayonase": "mayonnaise",
    "mayorial": "mayoral",
    "mean while": "meanwhile",
    "mechanisim": "mechanism",
    "meddo": "meadow",
    "mediciney": "mediciny",
    "Mediteranean": "Mediterranean",
    "Mediterranian": "Mediterranean",
    "Mediterrannean": "Mediterranean",
    "Meditteranean": "Mediterranean",
    "Meditterranean": "Mediterranean",
    "medow": "meadow",
    "meerkrat": "meerkat",
    "megaohm": "megohm",
    "megaohms": "megohms",
    "melineum": "millennium",
    "membranaphone": "membranophone",
    "memwars": "memoirs",
    "menues": "menus",
    "merang": "meringue",
    "mesages": "messages",
    "meskeeto": "mosquito",
    "mesures": "measures",
    "metalurgic": "metallurgic",
    "metalurgical": "metallurgical",
    "metalurgy": "metallurgy",
    "metamorphysis": "metamorphosis",
    "metres": "meters",
    "mezmorize": "mesmerize",
    "midevil": "medieval",
    "midrange": "mid-range",
    "midwifes": "midwives",
    "mileau": "milieu",
    "mileu": "milieu",
    "milion": "million",
    "milions": "millions",
    "minfields": "minefields",
    "ministery": "ministry",
    "minut": "minute",
    "minuts": "minutes",
    "miscelaneous": "miscellaneous",
    "miscellanious": "miscellaneous",
    "miscellanous": "miscellaneous",
    "mischevus": "mischievous",
    "misdemenors": "misdemeanors",
    "miselaneous": "miscellaneous",
    "mispell": "misspell",
    "mispelled": "misspelled",
    "mispelling": "misspelling",
    "mispellings": "misspellings",
    "missen": "mizzen",
    "Missisipi": "Mississippi",
    "missletow": "mistletoe",
    "misteak": "mystique",
    "mkaes": "makes",
    "moent": "moment",
    "monastary": "monastery",
    "monastry": "monastery",
    "monestaries": "monasteries",
    "monestary": "monastery",
    "moniter": "monitor",
    "monolite": "monolithic",
    "montainous": "mountainous",
    "monthes": "months",
    "montypic": "monotypic",
    "morgage": "mortgage",
    "morge": "morgue",
    "Morisette": "Morissette",
    "Morrisette": "Morissette",
    "mosiac": "mosaic",
    "mosiacs": "mosaics",
    "moteef": "motif",
    "motha": "mother",
    "mountaineous": "mountainous",
    "mountainus": "mountainous",
    "mountianous": "mountainous",
    "mountians": "mountains",
    "moutains": "mountains",
    "mouthfull": "mouthful",
    "mouthfulls": "mouthfuls",
    "movei": "movie",
    "mozzerella": "mozzarella",
    "mucuous": "mucous",
    "muder": "murder",
    "mudering": "murdering",
    "multistorey": "multi-storey",
    "multistory": "multi-storey",
    "muncipalities": "municipalities",
    "murr": "myrrh",
    "musik": "music",
    "mussil": "muscle",
    "mustash": "mustache",
    "musuems": "museums",
    "mybe": "maybe",
    "mysogynist": "misogynist",
    "mysogyny": "misogyny",
    "mystrow": "maestro",
    "Mythraic": "Mithraic",
    "myu": "my",
    "Napoleonian": "Napoleonic",
    "narled": "gnarled",
    "nastershum": "nasturtium",
    "native american": "Native American",
    "nawshus": "nauseous",
    "naybor": "neighbor",
    "Nazereth": "Nazareth",
    "nd": "and",
    "necasarilly": "necessarily",
    "necasarily": "necessarily",
    "necaserilly": "necessarily",
    "necaserily": "necessarily",
    "necasery": "necessary",
    "necassarilly": "necessarily",
    "necassarily": "necessarily",
    "necasserilly": "necessarily",
    "necasserily": "necessarily",
    "necassery": "necessary",
    "neccasarilly": "necessarily",
    "neccasarily": "necessarily",
    "neccasary": "necessary",
    "neccaserilly": "necessarily",
    "neccaserily": "necessarily",
    "neccasery": "necessary",
    "neccassarilly": "necessarily",
    "neccassarily": "necessarily",
    "neccassary": "necessary",
    "neccasserilly": "necessarily",
    "neccasserily": "necessarily",
    "neccassery": "necessary",
    "neccesarilly": "necessarily",
    "neccesarily": "necessarily",
    "necceserilly": "necessarily",
    "necceserily": "necessarily",
    "neccesities": "necessities",
    "neccesity": "necessity",
    "neccessarilly": "necessarily",
    "neccessarily": "necessarily",
    "neccesserilly": "necessarily",
    "neccesserily": "necessarily",
    "neccessities": "necessities",
    "neccessity": "necessity",
    "necesarilly": "necessarily",
    "necesarily": "necessarily",
    "neceserilly": "necessarily",
    "neceserily": "necessarily",
    "necesities": "necessities",
    "necesity": "necessity",
    "necessarally": "necessarily",
    "necessarilly": "necessarily",
    "necessary essentials": "essentials",
    "necesserilly": "necessarily",
    "necesserily": "necessarily",
    "negitivity": "negativity",
    "neglible": "negligible",
    "negligable": "negligible",
    "negociated": "negotiated",
    "negociating": "negotiating",
    "negociation": "negotiation",
    "negotable": "negotiable",
    "negotation": "negotiation",
    "negotiaing": "negotiating",
    "neigbors": "neighbors",
    "neighbouring": "neighboring",
    "neihborhoods": "neighborhoods",
    "nein": "no",
    "neral": "neural",
    "nervana": "nirvana",
    "nessacary": "necessary",
    "nessasarily": "necessarily",
    "nessecary": "necessary",
    "nestolgia": "nostalgia",
    "neumonic": "mnemonic",
    "nevemind": "nevermind",
    "newance": "nuance",
    "newely": "newly",
    "newmatic": "pneumatic",
    "newmonia": "pneumonia",
    "newsans": "nuisance",
    "next store": "next-door",
    "nickle": "nickel",
    "niether": "neither",
    "nieveatay": "naivete",
    "nife": "knife",
    "nighclubs": "nightclubs",
    "nighspot": "nightspot",
    "nighspots": "nightspots",
    "nimph": "nymph",
    "ninteen": "nineteen",
    "ninteenth": "nineteenth",
    "ninty": "ninety",
    "nitch": "niche",
    "nkwo": "know",
    "noisey": "noisy",
    "nome": "gnome",
    "nontheless": "nonetheless",
    "norhernmost": "northernmost",
    "normal everyday": "everyday",
    "northen": "northern",
    "northereastern": "northeastern",
    "noteable": "notable",
    "noteably": "notably",
    "noth": "north",
    "nothern": "northern",
    "noticable": "noticeable",
    "noticably": "noticeably",
    "noticible": "noticeable",
    "notoreous": "notorious",
    "notworthy": "noteworthy",
    "noveau": "nouveau",
    "now a days": "nowadays",
    "now adays": "nowadays",
    "nthng": "nothing",
    "nto": "not",
    "nuetral": "neutral",
    "nuetrality": "neutrality",
    "Nullabour": "Nullarbor",
    "numers": "numbers",
    "nuptual": "nuptial",
    "Nuremburg": "Nuremberg",
    "nurishment": "nourishment",
    "nuthin": "nothing",
    "nutral": "neutral",
    "nver": "never",
    "nwo": "now",
    "obation": "ovation",
    "obay": "obey",
    "obediance": "obedience",
    "obediant": "obedient",
    "obervation": "observation",
    "obleek": "oblique",
    "oblisk": "obelisk",
    "obsolecence": "obsolescence",
    "obsolecense": "obsolescence",
    "obsolesence": "obsolescence",
    "obsolesense": "obsolescence",
    "obstacal": "obstacle",
    "obsticle": "obstacle",
    "obviuos": "obvious",
    "ocapella": "a cappella",
    "ocasion": "occasion",
    "ocasional": "occasional",
    "ocasionally": "occasionally",
    "ocasionaly": "occasionally",
    "ocasioned": "occasioned",
    "ocasions": "occasions",
    "ocassion": "occasion",
    "ocassional": "occasional",
    "ocassionally": "occasionally",
    "ocassioned": "occasioned",
    "ocassions": "occasions",
    "occaisionally": "occasionally",
    "occasionaly": "occasionally",
    "occassion": "occasion",
    "occassional": "occasional",
    "occassionally": "occasionally",
    "occassionaly": "occasionally",
    "occassioned": "occasioned",
    "occassions": "occasions",
    "occation": "occasion",
    "occationally": "occasionally",
    "occurance": "occurrence",
    "occurances": "occurrences",
    "occured": "occurred",
    "occurence": "occurrence",
    "occurences": "occurrences",
    "occuring": "occurring",
    "occurr": "occur",
    "occurrance": "occurrence",
    "occurrances": "occurrences",
    "ocenarium": "oceanarium",
    "ocilate": "oscillate",
    "octogonal": "octagonal",
    "octohedra": "octahedra",
    "octohedral": "octahedral",
    "octohedron": "octahedron",
    "ocuntries": "countries",
    "ocuntry": "country",
    "ocur": "occur",
    "ocurr": "occur",
    "ocurrance": "occurrence",
    "ocurred": "occurred",
    "ocurrence": "occurrence",
    "odessy": "odyssey",
    "odoer": "odor",
    "odouriferous": "odoriferous",
    "odourous": "odorous",
    "oeprator": "operator",
    "ofering": "offering",
    "oferings": "offerings",
    "offen": "often",
    "offerd": "offered",
    "offical": "official",
    "offically": "officially",
    "officaly": "officially",
    "officialy": "officially",
    "offshot": "offshoot",
    "oftenly": "often",
    "olimpic": "olympic",
    "omage": "homage",
    "omelete": "omelette",
    "omeletes": "omelettes",
    "omelets": "omelettes",
    "omision": "omission",
    "omited": "omitted",
    "omiting": "omitting",
    "omlet": "omelette",
    "omlette": "omelette",
    "omlettes": "omelettes",
    "ommision": "omission",
    "ommited": "omitted",
    "ommiting": "omitting",
    "ommitted": "omitted",
    "ommitting": "omitting",
    "omnishints": "omniscience",
    "omniverous": "omnivorous",
    "omniverously": "omnivorously",
    "on going": "ongoing",
    "oneway": "one-way",
    "onomonopea": "onomatopoeia",
    "onyl": "only",
    "opayk": "opaque",
    "openend": "opened",
    "opertunity": "opportunity",
    "opinyon": "opinion",
    "oponent": "opponent",
    "oportunity": "opportunity",
    "oposite": "opposite",
    "oposites": "opposites",
    "oposition": "opposition",
    "oppasite": "opposite",
    "oppened": "opened",
    "oppening": "opening",
    "opperate": "operate",
    "opperation": "operation",
    "oppertunity": "opportunity",
    "oppinion": "opinion",
    "opposate": "opposite",
    "opposible": "opposable",
    "opposit": "opposite",
    "oppisite": "opposite",
    "oppotunities": "opportunities",
    "oppotunity": "opportunity",
    "opression": "oppression",
    "opressive": "oppressive",
    "opthalmologist": "ophthalmologist",
    "opthalmology": "ophthalmology",
    "opthamologist": "ophthalmologist",
    "optomism": "optimism",
    "optomist": "optimist",
    "optomistic": "optimistic",
    "opulant": "opulent",
    "orangatang": "orangutan",
    "orcestrate": "orchestrate",
    "ordanance": "ordinance",
    "oregeno": "oregano",
    "organim": "organism",
    "orginal": "original",
    "orginated": "originated",
    "orginization": "organization",
    "orginize": "organise",
    "orginized": "organized",
    "oricle": "oracle",
    "orietal": "oriental",
    "originaly": "originally",
    "originnally": "originally",
    "origional": "original",
    "orignally": "originally",
    "origonal": "original",
    "orkid": "orchid",
    "orthagonal": "orthogonal",
    "orthagonally": "orthogonally",
    "oscilliscope": "oscilloscope",
    "ostridge": "ostrich",
    "out side": "outside",
    "outputted": "output",
    "over again": "again",
    "over looked": "overlooked",
    "over looking": "overlooking",
    "overshaddowed": "overshadowed",
    "overun": "overrun",
    "overwelm": "overwhelm",
    "overwelming": "overwhelming",
    "owrk": "work",
    "owudl": "would",
    "oxident": "oxidant",
    "oxigen": "oxygen",
    "oximoron": "oxymoron",
    "oxyen": "oxygen",
    "paide": "paid",
    "pajent": "pageant",
    "paliamentarian": "parliamentarian",
    "Palistian": "Palestinian",
    "Palistinian": "Palestinian",
    "Palistinians": "Palestinians",
    "pallate": "palate",
    "pallette": "palette",
    "palyer": "player",
    "pamflet": "pamphlet",
    "pamplet": "pamphlet",
    "panarama": "panorama",
    "pantomine": "pantomime",
    "papaer": "paper",
    "Papanicalou": "Papanicolaou",
    "paradime": "paradigm",
    "paradym": "paradigm",
    "paralel": "parallel",
    "paralell": "parallel",
    "paralelly": "parallelly",
    "paralels": "parallels",
    "paralely": "parallelly",
    "parallell": "parallel",
    "parallely": "parallelly",
    "paramilitarie": "paramilitary",
    "parana": "piranha",
    "paranoya": "paranoia",
    "paranthesis": "parenthesis",
    "paraphanalia": "paraphernalia",
    "paraphenalia": "paraphernalia",
    "parc": "park",
    "parfay": "parfait",
    "parituclar": "particular",
    "parkay": "parquet",
    "parlaiment": "parliament",
    "parlaiments": "parliaments",
    "parlament": "parliament",
    "parliamint": "parliament",
    "parliamints": "parliaments",
    "parliment": "parliament",
    "parlimentarian": "parliamentarian",
    "parlimentary": "parliamentary",
    "parliments": "parliaments",
    "parrakeets": "parakeets",
    "parralel": "parallel",
    "parralell": "parallel",
    "parrallel": "parallel",
    "parrallell": "parallel",
    "parrallelly": "parallelly",
    "parrallely": "parallelly",
    "parshally": "partially",
    "partialy": "partially",
    "particpant": "participant",
    "particpated": "participated",
    "particularily": "particularly",
    "particulary": "particularly",
    "particullarly": "particularly",
    "particullary": "particularly",
    "paschurize": "pasteurize",
    "passanger": "passenger",
    "passangers": "passengers",
    "passtime": "pastime",
    "pastorial": "pastoral",
    "pasttime": "pastime",
    "pastural": "pastoral",
    "paticularly": "particularly",
    "pattented": "patented",
    "pavillion": "pavilion",
    "pavillions": "pavilions",
    "payed": "paid",
    "paymetn": "payment",
    "paymetns": "payments",
    "pciture": "picture",
    "peacefull": "peaceful",
    "peanuckle": "pinochle",
    "pease": "peace",
    "peculure": "peculiar",
    "pedistal": "pedestal",
    "peedmont": "piedmont",
    "peepel": "people",
    "peerowet": "pirouette",
    "peice": "piece",
    "peices": "pieces",
    "peirce": "pierce",
    "peircing": "piercing",
    "peleton": "peloton",
    "Peloponnes": "Peloponnesus",
    "penatentury": "penitentiary",
    "penatly": "penalty",
    "penetence": "penitence",
    "peninnsula": "peninsula",
    "penisula": "peninsula",
    "penisular": "peninsular",
    "penninsula": "peninsula",
    "penninsular": "peninsular",
    "pennisula": "peninsula",
    "Pennsilvania": "Pennsylvania",
    "Pensylvania": "Pennsylvania",
    "penwar": "peignoir",
    "peolpe": "people",
    "peom": "poem",
    "peoms": "poems",
    "peopel": "people",
    "peotry": "poetry",
    "percepted": "perceived",
    "percieve": "perceive",
    "percieved": "perceived",
    "performace": "performance",
    "performence": "performance",
    "perfurd": "preferred",
    "perhasp": "perhaps",
    "perheaps": "perhaps",
    "perhpas": "perhaps",
    "peripathetic": "peripatetic",
    "perjery": "perjury",
    "perjorative": "pejorative",
    "perliferate": "proliferate",
    "permanant": "permanent",
    "permantent": "permanent",
    "permenant": "permanent",
    "perminent": "permanent",
    "permissable": "permissible",
    "perogative": "prerogative",
    "peroid": "period",
    "peroids": "periods",
    "peronal": "personal",
    "perpare": "prepare",
    "perphas": "perhaps",
    "perpindicular": "perpendicular",
    "perrenial": "perennial",
    "perseed": "precede",
    "perserve": "preserve",
    "perserverance": "perseverance",
    "perservere": "persevere",
    "perserverence": "perseverance",
    "perseverence": "perseverance",
    "perseverent": "perseverant",
    "persew": "pursue",
    "persistance": "persistence",
    "persistant": "persistent",
    "persne": "person",
    "personalyl": "personally",
    "personel": "personnel",
    "personell": "personnel",
    "personna": "persona",
    "personnell": "personnel",
    "persue": "pursue",
    "persuing": "pursuing",
    "persuit": "pursuit",
    "perticipate": "participate",
    "pertinate": "pertinent",
    "pertubation": "perturbation",
    "pertubations": "perturbations",
    "perview": "purview",
    "pessiary": "pessary",
    "petetion": "petition",
    "pewder": "pewter",
    "phalic": "phallic",
    "pharmasudical": "pharmaceutical",
    "Pharoah": "Pharaoh",
    "pharoh": "pharaoh",
    "phenomenonal": "phenomenal",
    "phenomenonly": "phenomenally",
    "phenominal": "phenomenal",
    "phenomonenon": "phenomenon",
    "phenonmena": "phenomena",
    "Pheonix": "Phoenix",
    "Philedelphia": "Philadelphia",
    "Philipines": "Philippines",
    "philisopher": "philosopher",
    "philisophical": "philosophical",
    "philisophy": "philosophy",
    "Phillipine": "Philippine",
    "Phillippine": "Philippine",
    "Phillippines": "Philippines",
    "philsophy": "philosophy",
    "phlem": "phlegm",
    "Phonecian": "Phoenician",
    "phongraph": "phonograph",
    "photoe": "photo",
    "photoes": "photos",
    "physision": "physician",
    "physisist": "physicist",
    "pich": "pitch",
    "pickeled": "pickled",
    "picknick": "picnic",
    "pickyune": "picayune",
    "picnicing": "picnicking",
    "picturesk": "picturesque",
    "pijun": "pigeon", "pilon": "pylon",
    "pikled": "pickled",
    "pilgrimmage": "pilgrimage",
    "pilgrimmages": "pilgrimages",
    "pinapple": "pineapple",
    "pinnaple": "pineapple",
    "pinneaple": "pineapple",
    "pirric": "Pyrrhic",
    "pizeria": "pizzeria",
    "plack": "plaque",
    "plad": "plaid",
    "plagerism": "plagiarism",
    "planed": "planned",
    "plantiff": "plaintiff",
    "plattoe": "plateau",
    "playge": "plague",
    "playgerise": "plagiarize",
    "playgrand": "playground",
    "playgrands": "playgrounds",
    "playright": "playwright",
    "playwrite": "playwright",
    "playwrites": "playwrights",
    "pleaseant": "pleasant",
    "pleasent": "pleasant",
    "plebicite": "plebiscite",
    "plesant": "pleasant",
    "pliotropy": "pleiotropy",
    "pneumonic": "pneumonic",
    "pocession": "possession",
    "poeple": "people",
    "poinsetta": "poinsettia",
    "pointseta": "poinsettia",
    "poinyent": "poignant",
    "poisin": "poison",
    "poliet": "polite",
    "polinator": "pollinator",
    "polinators": "pollinators",
    "politicing": "politicking",
    "polltry": "poultry",
    "poltry": "poultry",
    "polular": "popular",
    "polute": "pollute",
    "poluted": "polluted",
    "polutes": "pollutes",
    "poluting": "polluting",
    "polution": "pollution",
    "polysaccaride": "polysaccharide",
    "polysaccharid": "polysaccharide",
    "pomegranite": "pomegranate",
    "pommegranate": "pomegranate",
    "poore": "poor",
    "poperee": "potpourri",
    "populaion": "population",
    "popularaty": "popularity",
    "porblem": "problem",
    "porblems": "problems",
    "poriferal": "peripheral",
    "porpensity": "propensity",
    "porsalin": "porcelain",
    "portrail": "portrayal",
    "Portugeese": "Portuguese",
    "Portugese": "Portuguese",
    "porvide": "provide",
    "posess": "possess",
    "posessed": "possessed",
    "posesses": "possesses",
    "posessing": "possessing",
    "posession": "possession",
    "posessions": "possessions",
    "posistion": "position",
    "pospone": "postpone",
    "possable": "possible",
    "possably": "possibly",
    "posses": "possess",
    "posseses": "possesses",
    "possesing": "possessing",
    "possesion": "possession",
    "possesions": "possessions",
    "possibilty": "possibility",
    "possibily": "possibly",
    "possition": "position",
    "Postdam": "Potsdam",
    "postion": "position",
    "postition": "position",
    "postuminus": "posthumous",
    "postumus": "posthumous",
    "potates": "potatoes",
    "potentialy": "potentially",
    "powerfull": "powerful",
    "practial": "practical",
    "practially": "practically",
    "practicaly": "practically",
    "practicianer": "practitioner",
    "practicioner": "practitioner",
    "practicioners": "practitioners",
    "practicly": "practically",
    "practioner": "practitioner",
    "practioners": "practitioners",
    "prairy": "prairie",
    "prarie": "prairie",
    "pratice": "practice",
    "prayry": "prairie",
    "preample": "preamble",
    "precedessor": "predecessor",
    "preceed": "precede",
    "preceeded": "preceded",
    "preceeding": "preceding",
    "preceeds": "precedes",
    "precint": "precinct",
    "precints": "precincts",
    "precurser": "precursor",
    "predomiantly": "predominantly",
    "predominately": "predominantly",
    "prefacture": "prefecture",
    "preferance": "preference",
    "prefered": "preferred",
    "prefering": "preferring",
    "preferrable": "preferable",
    "preferrably": "preferably",
    "preffered": "preferred",
    "preficiency": "proficiency",
    "preficient": "proficient",
    "preform": "perform",
    "pregancies": "pregnancies",
    "pregancy": "pregnancy",
    "pregnent": "pregnant",
    "prehaps": "perhaps",
    "prejudgudice": "prejudice",
    "premeired": "premiered",
    "premillenial": "premillennial",
    "premisis": "premises",
    "premission": "permission",
    "Premonasterians": "Premonstratensians",
    "prepair": "prepare",
    "prepartion": "preparation",
    "prepatory": "preparatory",
    "preperation": "preparation",
    "preperations": "preparations",
    "preperatory": "preparatory",
    "presance": "presence",
    "Presbaterian": "Presbyterian",
    "presense": "presence",
    "preshus": "precious",
    "presidental": "presidential",
    "prestigeous": "prestigious",
    "prestigous": "prestigious",
    "prestine": "pristine",
    "presumibly": "presumably",
    "prevelance": "prevalence",
    "prevelant": "prevalent",
    "preventation": "prevention",
    "previvous": "previous",
    "prgram": "program",
    "prgrmmng": "programming",
    "Pricilla": "Priscilla",
    "pricipal": "principal",
    "priciple": "principle",
    "primarly": "primarily",
    "primative": "primitive",
    "primatively": "primitively",
    "primatives": "primitives",
    "primevil": "primeval",
    "primordal": "primordial",
    "principial": "principal",
    "principly": "principally",
    "Princton": "Princeton",
    "prinicipal": "principal",
    "pristene": "pristine",
    "privat": "private",
    "priveledge": "privilege",
    "priveledges": "privileges",
    "privelege": "privilege",
    "priveleged": "privileged",
    "priveleges": "privileges",
    "privelidge": "privilege",
    "privelige": "privilege",
    "priveliged": "privileged",
    "priveliges": "privileges",
    "privilage": "privilege",
    "priviledge": "privilege",
    "priviledges": "privileges",
    "privilidge": "privilege",
    "privilige": "privilege",
    "privledge": "privilege",
    "probabaly": "probably",
    "probablly": "probably",
    "probalibity": "probability",
    "probaly": "probably",
    "probelm": "problem",
    "probelms": "problems",
    "problen": "problem",
    "problens": "problems",
    "proccess": "process",
    "proccessing": "processing",
    "procede": "proceed",
    "procedger": "procedure",
    "proceding": "proceeding",
    "procedings": "proceedings",
    "proceedure": "procedure",
    "proclamed": "proclaimed",
    "proclaming": "proclaiming",
    "proclimation": "proclamation",
    "proclomation": "proclamation",
    "produc": "product",
    "producs": "products",
    "profecient": "proficient",
    "profesor": "professor",
    "proffesion": "profession",
    "proffesional": "professional",
    "proffesor": "professor",
    "profilic": "prolific",
    "programable": "programmable",
    "programm": "program",
    "programme": "program",
    "prohabition": "prohibition",
    "prohibative": "prohibitive",
    "prolicks": "prolix",
    "prologomena": "prolegomena",
    "prominance": "prominence",
    "prominant": "prominent",
    "prominantly": "prominently",
    "prominate": "prominent",
    "promiscous": "promiscuous",
    "pronomial": "pronominal",
    "pronounciation": "pronunciation",
    "pronounciations": "pronunciations",
    "propably": "probably",
    "prophacy": "prophecy",
    "propietary": "proprietary",
    "propoganda": "propaganda",
    "propogate": "propagate",
    "propogated": "propagated",
    "propogates": "propagates",
    "propogating": "propagating",
    "propogation": "propagation",
    "propogator": "propagator",
    "propotions": "proportions",
    "propper": "proper",
    "propreitory": "proprietary",
    "propriatery": "proprietary",
    "proprieter": "proprietor",
    "proprietory": "proprietary",
    "proseletyzing": "proselytizing",
    "protaganist": "protagonist",
    "protaganists": "protagonists",
    "proteen": "protein",
    "protocal": "protocol",
    "protocall": "protocol",
    "protrayed": "portrayed",
    "protruberance": "protuberance",
    "protruberances": "protuberances",
    "provded": "provided",
    "provice": "province",
    "provinicial": "provincial",
    "proximaty": "proximity",
    "proximety": "proximity",
    "prpensity": "propensity",
    "pseudononymous": "pseudonymous",
    "pseudonyn": "pseudonym",
    "psoition": "position",
    "psuedo": "pseudo",
    "psycology": "psychology",
    "psydonym": "pseudonym",
    "psyhic": "psychic",
    "pteradactyl": "pterodactyl",
    "ptogress": "progress",
    "Pucini": "Puccini",
    "pumkin": "pumpkin",
    "pundent": "pundit",
    "purchace": "purchase",
    "purchaces": "purchases",
    "purchacing": "purchasing",
    "purposedly": "purposely",
    "pursuade": "persuade",
    "pursuaded": "persuaded",
    "pursuades": "persuades",
    "purtain": "pertain",
    "pusse": "pussie",
    "pususading": "persuading",
    "puting": "putting",
    "pwoer": "power",
    "pyscic": "psychic",
    "quadroople": "quadruple",
    "quafeur": "coiffure",
    "qualitatative": "qualitative",
    "quandry": "quandary",
    "quanity": "quantity",
    "quantaty": "quantity",
    "quantitiy": "quantity",
    "quarantaine": "quarantine",
    "quater-final": "quarterfinal",
    "quater": "quarter",
    "quaterback": "quarterback",
    "quaterly": "quarterly",
    "quatermaster": "quartermaster",
    "quaters": "quarters",
    "quesion": "question",
    "quesions": "questions",
    "questioms": "questions",
    "questionaire": "questionnaire",
    "questionare": "questionnaire",
    "questiosn": "questions",
    "questoin": "question",
    "quetion": "question",
    "quetions": "questions",
    "quicklyu": "quickly",
    "quietitude": "quietude",
    "quire": "choir",
    "quitely": "quietly",
    "quizes": "quizzes",
    "quizs": "quizzes",
    "quotion": "quotient",
    "rabinnical": "rabbinical",
    "rabit": "rabbit",
    "racoon": "raccoon",
    "radeus": "radius",
    "radify": "ratify",
    "rainning": "raining",
    "rancourous": "rancorous",
    "randayvoo": "rendezvous",
    "rapsady": "rhapsody",
    "rarley": "rarely",
    "rasberry": "raspberry",
    "re-realeased": "re-released",
    "realease": "release",
    "realeased": "released",
    "realisticaly": "realistically",
    "realted": "related",
    "realtive": "relative",
    "realtively": "relatively",
    "realtivistic": "relativistic",
    "rebuttle": "rebuttal",
    "reccomend": "recommend",
    "reccomendation": "recommendation",
    "reccomendations": "recommendations",
    "reccomended": "recommended",
    "reccomending": "recommending",
    "reccomends": "recommends",
    "reccommend": "recommend",
    "reccommended": "recommended",
    "reccommending": "recommending",
    "reccuring": "recurring",
    "receed": "recede",
    "receeded": "receded",
    "receeding": "receding",
    "receet": "receipt",
    "receieve": "receive",
    "recepient": "recipient",
    "recepients": "recipients",
    "receptical": "receptacle",
    "recide": "reside",
    "recided": "resided",
    "recident": "resident",
    "recidents": "residents",
    "reciding": "residing",
    "reciept": "receipt",
    "reciepts": "receipts",
    "recieve": "receive",
    "recieved": "received",
    "reciever": "receiver",
    "recievers": "receivers",
    "recieves": "receives",
    "recieving": "receiving",
    "recipiant": "recipient",
    "recipiants": "recipients",
    "recipies": "recipes",
    "recogise": "recognise",
    "recogize": "recognize",
    "recomend": "recommend",
    "recomendable": "recommendable",
    "recomendation": "recommendation",
    "recomendations": "recommendations",
    "recomended": "recommended",
    "recomending": "recommending",
    "recomends": "recommends",
    "recommand": "recommend",
    "recommands": "recommends",
    "recommented": "recommended",
    "reconaissance": "reconnaissance",
    "reconasence": "reconnaissance",
    "reconcilation": "reconciliation",
    "reconize": "recognize",
    "reconnaissence": "reconnaissance",
    "recquired": "required",
    "recrational": "recreational",
    "recrod": "record",
    "recroot": "recruit",
    "recruted": "recruited",
    "recund": "reckoned",
    "recurrance": "recurrence",
    "recurrant": "recurrent",
    "redicule": "ridicule",
    "rediculous": "ridiculous",
    "reduceable": "reducible",
    "referal": "referral",
    "refered": "referred",
    "refering": "referring",
    "referrs": "refers",
    "reffered": "referred",
    "refference": "reference",
    "refridgeration": "refrigeration",
    "refridgerator": "refrigerator",
    "refusla": "refusal",
    "regluar": "regular",
    "reguardless": "regardless",
    "reguarly": "regularly",
    "regularily": "regularly",
    "regulary": "regularly",
    "rehearsel": "rehearsal",
    "rehersal": "rehearsal",
    "reknown": "renown",
    "reknowned": "renowned",
    "rela": "real",
    "relagate": "relegate",
    "relagated": "relegated",
    "relatiopnship": "relationship",
    "relativly": "relatively",
    "relavant": "relevant",
    "relavent": "relevant",
    "releaf": "relief",
    "relegious": "religious",
    "releive": "relieve",
    "releived": "relieved",
    "relevence": "relevance",
    "relevent": "relevant",
    "relict": "relic",
    "relicts": "relics",
    "religeon": "religion",
    "religeous": "religious",
    "religous": "religious",
    "relitively": "relatively",
    "relization": "realization",
    "relize": "realize",
    "relm": "realm",
    "reluctent": "reluctant",
    "remainer": "remainder",
    "remaing": "remaining",
    "remainging": "remaining",
    "remanant": "remnant",
    "remanants": "remnants",
    "remane": "remain",
    "remaning": "remaining",
    "rember": "remember",
    "remeber": "remember",
    "rememberance": "remembrance",
    "remembrence": "remembrance",
    "remenant": "remnant",
    "remenants": "remnants",
    "remenent": "remnant",
    "remenents": "remnants",
    "remeniss": "reminisce",
    "reminent": "remnant",
    "reminescent": "reminiscent",
    "reminicent": "reminiscent",
    "reminisent": "reminiscent",
    "remnance": "remnants",
    "rendevous": "rendezvous",
    "renisance": "renaissance",
    "rennaisance": "renaissance",
    "renoun": "renown",
    "reommend": "recommend",
    "repatwar": "repertoire",
    "repelant": "repellent",
    "repellant": "repellent",
    "repentence": "repentance",
    "repentent": "repentant",
    "repertwar": "repertoire",
    "repetion": "repetition",
    "repetoire": "repertoire",
    "repies": "replies",
    "replentish": "replenish",
    "reponse": "response",
    "reponsible": "responsible",
    "repore": "rapport",
    "representativs": "representatives",
    "representive": "representative",
    "representives": "representatives",
    "represetned": "represented",
    "represnt": "represent",
    "repubic": "republic",
    "requeum": "requiem",
    "resembelance": "resemblance",
    "resemblence": "resemblance",
    "reserach": "research",
    "reservior": "reservoir",
    "reserviors": "reservoirs",
    "reservor": "reservoir",
    "resevior": "reservoir",
    "reseviors": "reservoirs",
    "resevoir": "reservoir",
    "resevoirs": "reservoirs",
    "residance": "residence",
    "residant": "resident",
    "residants": "residents",
    "resistable": "resistible",
    "resistence": "resistance",
    "resistent": "resistant",
    "resivwar": "reservoir",
    "resollution": "resolution",
    "reson": "reason",
    "resonable": "reasonable",
    "resorces": "resources",
    "resourses": "recourses",
    "respomd": "respond",
    "respomse": "response",
    "responce": "response",
    "responnsibilty": "responsibility",
    "responsability": "responsibility",
    "responsable": "responsible",
    "responsibile": "responsible",
    "responsiblity": "responsibility",
    "resposible": "responsible",
    "ressapee": "recipe",
    "ressemblance": "resemblance",
    "ressemble": "resemble",
    "ressembled": "resembled",
    "ressemblence": "resemblance",
    "ressembling": "resembling",
    "ressort": "resort",
    "ressurection": "resurrection",
    "restarant": "restaurant",
    "restarants": "restaurants",
    "restaraunt": "restaurant",
    "restaraunteur": "restaurateur",
    "restaraunteurs": "restaurateurs",
    "restaraunts": "restaurants",
    "restarent": "restaurant",
    "restarents": "restaurants",
    "restaront": "restaurant",
    "restaronts": "restaurants",
    "restauant": "restaurant",
    "restauants": "restaurants",
    "restauranteur": "restaurateur",
    "restauration": "restoration",
    "restauraunt": "restaurant",
    "restauraunts": "restaurants",
    "restaurent": "restaurant",
    "restaurents": "restaurants",
    "restauront": "restaurant",
    "restauronts": "restaurants",
    "restautant": "restaurant",
    "restautants": "restaurants",
    "resterant": "restaurant",
    "resterants": "restaurants",
    "resteraunt": "restaurant",
    "resteraunts": "restaurants",
    "resterent": "restaurant",
    "resterents": "restaurants",
    "resteront": "restaurant",
    "resteronts": "restaurants",
    "restorant": "restaurant",
    "restorants": "restaurants",
    "restoraunt": "restaurant",
    "restoraunts": "restaurants",
    "restorent": "restaurant",
    "restorents": "restaurants",
    "restoront": "restaurant",
    "restoronts": "restaurants",
    "restourant": "restaurant",
    "restourants": "restaurants",
    "restouraunt": "restaurant",
    "restouraunts": "restaurants",
    "restourent": "restaurant",
    "restourents": "restaurants",
    "restouront": "restaurant",
    "restouronts": "restaurants",
    "restrant": "restaurant",
    "restrants": "restaurants",
    "restraunt": "restaurant",
    "restraunts": "restaurants",
    "restraurant": "restaurant",
    "restrent": "restaurant",
    "restrents": "restaurants",
    "restront": "restaurant",
    "restronts": "restaurants",
    "restuarant": "restaurant",
    "restuarants": "restaurants",
    "restuaraunt": "restaurant",
    "restuaraunts": "restaurants",
    "restuarent": "restaurant",
    "restuarents": "restaurants",
    "restuaront": "restaurant",
    "restuaronts": "restaurants",
    "resturant": "restaurant",
    "resturants": "restaurants",
    "resturaunt": "restaurant",
    "resturaunts": "restaurants",
    "resturent": "restaurant",
    "resturents": "restaurants",
    "resturont": "restaurant",
    "resturonts": "restaurants",
    "resurecting": "resurrecting",
    "resurgance": "resurgence",
    "retalitated": "retaliated",
    "retalitation": "retaliation",
    "rether": "rather",
    "retinew": "retinue",
    "retoric": "rhetoric",
    "retorical": "rhetorical",
    "reult": "result",
    "revaluated": "reevaluated",
    "reveiw": "review",
    "reveiwing": "reviewing",
    "revelance": "relevance",
    "revelant": "relevant",
    "reverance": "reverence",
    "reverand": "reverend",
    "reverant": "reverent",
    "reversable": "reversible",
    "revolutionar": "revolutionary",
    "rewriet": "rewrite",
    "rhinosarus": "rhinoceros",
    "rhymme": "rhyme",
    "rhythem": "rhythm",
    "rhythim": "rhythm",
    "rhythym": "rhythm",
    "rickoshay": "ricochet",
    "riendeer": "reindeer",
    "rige": "ridge",
    "rigeur": "rigueur",
    "rigourous": "rigorous",
    "rigourously": "rigorously",
    "riksha": "rickshaw",
    "rikshas": "rickshaws",
    "rikshaw": "rickshaw",
    "rikshaws": "rickshaws",
    "rimaniss": "reminisce",
    "riminicent": "reminiscent",
    "rininging": "ringing",
    "rinosarus": "rhinoceros",
    "risoto": "risotto",
    "rissoto": "risotto",
    "rissotto": "risotto",
    "rithm": "rhythm",
    "rittled": "riddled",
    "riveside": "riverside",
    "Rockerfeller": "Rockefeller",
    "rococco": "rococo",
    "romansque": "Romanesque",
    "rondayvoo": "rendezvous",
    "rubarb": "rhubarb",
    "rudimentry": "rudimentary",
    "ruine": "ruin",
    "ruines": "ruins",
    "rulle": "rule",
    "rulled": "ruled",
    "rumatic": "rheumatic",
    "rumers": "rumors",
    "russina": "Russian",
    "Russion": "Russian",
    "rwite": "write",
    "rythem": "rhythm",
    "rythim": "rhythm",
    "rythm": "rhythm",
    "rythym": "rhythm",
    "sabotour": "saboteur",
    "sacarin": "saccharin",
    "sacond": "second",
    "sacrafice": "sacrifice",
    "sacreligious": "sacrilegious",
    "sacrilegeous": "sacrilegious",
    "sacrin": "saccharin",
    "saftey": "safety",
    "safty": "safety",
    "sah": "sir",
    "salat": "salad",
    "saleries": "salaries",
    "salery": "salary",
    "salpeter": "saltpeter",
    "sammon": "salmon",
    "samori": "samurai",
    "samwich": "sandwich",
    "sanaty": "sanity",
    "sandwhich": "sandwich",
    "sandwhiches": "sandwiches",
    "sandwidch": "sandwich",
    "sandwidches": "sandwiches",
    "sandwitch": "sandwich",
    "sandwitches": "sandwiches",
    "Sanhedrim": "Sanhedrin",
    "sanwich": "sandwich",
    "saphire": "sapphire",
    "sargant": "sergeant",
    "sargent": "sergeant",
    "satelite": "satellite",
    "satelites": "satellites",
    "saterday": "saturday",
    "saterdays": "saturdays",
    "satilite": "satellite",
    "satric": "satiric",
    "satrical": "satirical",
    "satrically": "satirically",
    "sattelite": "satellite",
    "sattelites": "satellites",
    "sattellite": "satellite",
    "savere": "severe",
    "savve": "salve",
    "savy": "savvy",
    "saxaphone": "saxophone",
    "scafolding": "scaffolding",
    "scaleable": "scalable",
    "Scandanavia": "Scandinavia",
    "scedule": "schedule",
    "sceduled": "scheduled",
    "scenaireo": "scenario",
    "scenary": "scenery",
    "scence": "sense",
    "schedual": "schedule",
    "Schwarznegger": "Schwarzenegger",
    "scirpt": "script",
    "scoll": "scroll",
    "SCSI Interface": "SCSI",
    "scupture": "sculpture",
    "scuptures": "sculptures",
    "seabord": "seaboard",
    "seach": "search",
    "seached": "searched",
    "seaches": "searches",
    "seconday": "secondary",
    "secratary": "secretary",
    "secretery": "secretary",
    "sectino": "section",
    "sedantary": "sedentary",
    "sedereal": "sidereal",
    "seege": "siege",
    "seezure": "seizure",
    "segway": "segue",
    "seh": "she",
    "seige": "siege",
    "seiges": "sieges",
    "seina": "sienna",
    "selacious": "salacious",
    "selction": "selection",
    "selectoin": "selection",
    "senaireo": "scenario",
    "senarreo": "scenario",
    "sence": "sense",
    "senic": "scenic",
    "senoir": "senior",
    "sensable": "sensible",
    "sensure": "censure",
    "sentance": "sentence",
    "seond": "second",
    "separeate": "separate",
    "seperate": "separate",
    "seperated": "separated",
    "seperately": "separately",
    "seperates": "separates",
    "seperating": "separating",
    "seperation": "separation",
    "seperatism": "separatism",
    "seperatist": "separatist",
    "seperatists": "separatists",
    "sepina": "subpoena",
    "seplicural": "sepulchral",
    "serach": "search",
    "sercumstances": "circumstances",
    "sereous": "serious",
    "sergon": "surgeon",
    "serieses": "series",
    "serivce": "service",
    "serivced": "serviced",
    "serveral": "several",
    "severeal": "several",
    "sewdonim": "pseudonym",
    "sexul": "sexual",
    "shaddow": "shadow",
    "shandeleer": "chandelier",
    "shaneal": "chenille",
    "sharlaton": "charlatan",
    "sharraids": "charades",
    "shatow": "chateaux",
    "shcool": "school",
    "sheild": "shield",
    "shepard": "shepherd",
    "sherif": "sheriff",
    "shineing": "shining",
    "shiped": "shipped",
    "shoe-in": "shoo-in",
    "shoe box": "shoebox",
    "sholder": "shoulder",
    "shoping": "shopping",
    "short cut": "shortcut",
    "showfer": "chauffeur",
    "showinf": "showing",
    "showvinism": "chauvinism",
    "shreak": "shriek",
    "shreded": "shredded",
    "shur": "sure",
    "shure": "sure",
    "Shwarzenegger": "Schwarzenegger",
    "sicinctly": "succinctly",
    "sicne": "since",
    "side kick": "sidekick",
    "sideral": "sidereal",
    "siduction": "seduction",
    "siezure": "seizure",
    "siezures": "seizures",
    "sighrynge": "syringe",
    "sighth": "scythe",
    "signifacnt": "significant",
    "signifantly": "significantly",
    "significently": "significantly",
    "signifigant": "significant",
    "signitories": "signatories",
    "signitory": "signatory",
    "signiture": "signature",
    "sigth": "sight",
    "sigths": "sights",
    "siguret": "cigarette",
    "sillybus": "syllabus",
    "silowet": "silhouette",
    "simalar": "similar",
    "simetric": "symmetric",
    "similarily": "similarly",
    "similiar": "similar",
    "similiarity": "similarity",
    "simmilar": "similar",
    "simmilarly": "similarly",
    "simpley": "simply",
    "simplier": "simpler",
    "simpyl": "simply",
    "simular": "similar",
    "simulcasted": "simulcast",
    "simultanous": "simultaneous",
    "sinagogue": "synagogue",
    "sinagogues": "synagogues",
    "sincerley": "sincerely",
    "sincerly": "sincerely",
    "sinegog": "synagogue",
    "single-handily": "single-handedly",
    "singsog": "singsong",
    "Sionist": "Zionist",
    "Sionists": "Zionists",
    "sirious": "serious",
    "sirvaylence": "surveillance",
    "sist": "cyst",
    "sitaute": "situate",
    "sitauted": "situated",
    "sitll": "still",
    "sive": "sieve",
    "Sixtin": "Sistine",
    "sizors": "scissors",
    "Skandinavia": "Scandinavia",
    "skillz": "skills",
    "skitsofrinic": "schizophrenic",
    "skool": "school",
    "skurge": "scourge",
    "skyview": "Skyvi",
    "sleave": "sleeve",
    "sleding": "sledding",
    "slepp": "sleep",
    "slewth": "sleuth",
    "slided": "slid",
    "slipperly": "slippery",
    "sloagen": "slogan",
    "slooth": "sleuth",
    "smittn": "smitten",
    "smoothe": "smooth",
    "smoothes": "smooths",
    "snese": "sneeze",
    "snorkelling": "snorkeling",
    "snorkling": "snorkeling",
    "sodder": "solder",
    "sofmore": "sophomore",
    "sofware": "software",
    "sohw": "show",
    "soical": "social",
    "solatary": "solitary",
    "soldger": "soldier",
    "soley": "solely",
    "solger": "soldier",
    "soliders": "soldiers",
    "soliliquy": "soliloquy",
    "solitare": "solitaire",
    "soluable": "soluble",
    "solum": "solemn",
    "some what": "somewhat",
    "somethign": "something",
    "someting": "something",
    "somewaht": "somewhat",
    "somthing": "something",
    "somtimes": "sometimes",
    "somwhere": "somewhere",
    "sooaside": "suicide",
    "soodonim": "pseudonym",
    "sooit": "suet",
    "soop": "soup",
    "sophicated": "sophisticated",
    "sophmore": "sophomore",
    "sorceror": "sorcerer",
    "sord": "sword",
    "sot": "hat",
    "sotry": "story",
    "soudn": "sound",
    "soudns": "sounds",
    "sould": "should",
    "sourbraten": "sauerbraten",
    "sourond": "surround",
    "souronding": "surrounding",
    "sourrond": "surround",
    "sourronding": "surrounding",
    "sourrounding": "surrounding",
    "sourth": "south",
    "sourthern": "southern",
    "southest": "southeast",
    "southheast": "southeast",
    "souveneir": "souvenir",
    "souveneirs": "souvenirs",
    "souvenier": "souvenir",
    "souveniers": "souvenirs",
    "souvernir": "souvenir",
    "souvernirs": "souvenirs",
    "souvineers": "souvenirs",
    "sovereignity": "sovereignty",
    "soverign": "sovereign",
    "soverignity": "sovereignty",
    "sovren": "sovereign",
    "soz": "sorry",
    "sp34k": "speak",
    "spacial": "spatial",
    "spageti": "spaghetti",
    "spagetti": "spaghetti",
    "spagnum": "sphagnum",
    "spainish": "Spanish",
    "spase": "space",
    "speach": "speech",
    "specificaly": "specifically",
    "specificalyl": "specifically",
    "speciman": "specimen",
    "specktor": "specter",
    "spectactular": "spectacular",
    "spectauclar": "spectacular",
    "spermatazoa": "spermatozoa",
    "speshal": "special",
    "spicey": "spicy",
    "spicific": "specific",
    "splended": "splendid",
    "splitted": "split",
    "sponser": "sponsor",
    "spontanious": "spontaneous",
    "spontanous": "spontaneous",
    "sponzored": "sponsored",
    "spreaded": "spread",
    "sqaure": "square",
    "squirel": "squirrel",
    "squirl": "squirrel",
    "stalagtite": "stalactite",
    "standars": "standards",
    "Standsted": "Stansted",
    "stange": "strange",
    "startegic": "strategic",
    "startegies": "strategies",
    "startegy": "strategy",
    "statment": "statement",
    "statments": "statements",
    "stilus": "stylus",
    "stingent": "stringent",
    "stnad": "stand",
    "stocastic": "stochastic",
    "stopry": "story",
    "storeis": "stories",
    "storise": "stories",
    "stornegst": "strongest",
    "storng": "strong",
    "stoyr": "story",
    "stpo": "stop",
    "stradegies": "strategies",
    "stradegy": "strategy",
    "stran": "strand",
    "streest": "streets",
    "strenghen": "strengthen",
    "strenghened": "strengthened",
    "strenghening": "strengthening",
    "strenght": "strength",
    "strenghten": "strengthen",
    "strenghtened": "strengthened",
    "strenghtening": "strengthening",
    "strenous": "strenuous",
    "strentgh": "strength",
    "strictist": "strictest",
    "stright": "straight",
    "striked": "struck",
    "strnad": "strand",
    "stroy": "story",
    "structer": "structure",
    "structue": "structure",
    "struggel": "struggle",
    "strugle": "struggle",
    "stubborness": "stubbornness",
    "stucture": "structure",
    "stuctured": "structured",
    "studdy": "study",
    "studing": "studying",
    "studnet": "student",
    "stuning": "stunning",
    "subcatagories": "subcategories",
    "subcatagory": "subcategory",
    "subconchus": "subconscious",
    "subconcious": "subconscious",
    "subjetc": "subject",
    "subseqent": "subsequent",
    "subsidary": "subsidiary",
    "subsiduary": "subsidiary",
    "substace": "substance",
    "substancial": "substantial",
    "substatial": "substantial",
    "substitude": "substitute",
    "substract": "subtract",
    "substracted": "subtracted",
    "substracting": "subtracting",
    "substraction": "subtraction",
    "substracts": "subtracts",
    "subterranian": "subterranean",
    "subtrafuge": "subterfuge",
    "succeded": "succeeded",
    "succes": "success",
    "succesful": "successful",
    "succesfully": "successfully",
    "succesfuly": "successfully",
    "succesion": "succession",
    "succesive": "successive",
    "successfull": "successful",
    "successfuly": "successfully",
    "successfulyl": "successfully",
    "suceed": "succeed",
    "suceeded": "succeeded",
    "suceeding": "succeeding",
    "suceeds": "succeeds",
    "sucesful": "successful",
    "sucesfully": "successfully",
    "sucesfuly": "successfully",
    "sucesion": "succession",
    "sucess": "success",
    "sucesses": "successes",
    "sucessful": "successful",
    "sucessfull": "successful",
    "sucessfully": "successfully",
    "sucessfuly": "successfully",
    "sucession": "succession",
    "sucessive": "successive",
    "sucide": "suicide",
    "sucome": "succumb",
    "sucsede": "succeed",
    "suffcient": "sufficient",
    "suffciently": "sufficiently",
    "sufferage": "suffrage",
    "sufficent": "sufficient",
    "sufficently": "sufficiently",
    "sufficiant": "sufficient",
    "suffisticated": "sophisticated",
    "suggar": "sugar",
    "sumary": "summary",
    "suop": "soup",
    "supeena": "subpoena",
    "superceded": "superseded",
    "supercedes": "supersedes",
    "superceding": "superseding",
    "superceed": "supersede",
    "superceeded": "superseded",
    "supercession": "supersession",
    "superfulous": "superfluous",
    "superintendant": "superintendent",
    "superseed": "supersede",
    "suphisticated": "sophisticated",
    "suplement": "supplement",
    "supose": "suppose",
    "suposed": "supposed",
    "suposedly": "supposedly",
    "suposes": "supposes",
    "suposing": "supposing",
    "suppliment": "supplement",
    "suppossed": "supposed",
    "suppy": "supply",
    "supress": "suppress",
    "supressed": "suppressed",
    "supresses": "suppresses",
    "supressing": "suppressing",
    "suprise": "surprise",
    "suprised": "surprised",
    "suprising": "surprising",
    "suprisingly": "surprisingly",
    "suprize": "surprise",
    "suprized": "surprised",
    "suprizing": "surprising",
    "suprizingly": "surprisingly",
    "surbert": "sherbet",
    "surburb": "suburb",
    "surburbs": "suburbs",
    "surename": "surname",
    "surond": "surround",
    "suronding": "surrounding",
    "suround": "surround",
    "surounded": "surrounded",
    "surounding": "surrounding",
    "suroundings": "surroundings",
    "surounds": "surrounds",
    "surplanted": "supplanted",
    "surpress": "suppress",
    "surpressed": "suppressed",
    "surprize": "surprise",
    "surprized": "surprised",
    "surprizing": "surprising",
    "surprizingly": "surprisingly",
    "surrepetitious": "surreptitious",
    "surrepetitiously": "surreptitiously",
    "surreptious": "surreptitious",
    "surreptiously": "surreptitiously",
    "surrond": "surround",
    "surronding": "surrounding",
    "surrundering": "surrendering",
    "surveill": "surveil",
    "surveyer": "surveyor",
    "surviver": "survivor",
    "survivers": "survivors",
    "suseptable": "susceptible",
    "suseptible": "susceptible",
    "susincly": "succinctly",
    "susinkt": "succinct",
    "suspision": "suspicion",
    "sussinct": "succinct",
    "suttle": "subtle",
    "suvenear": "souvenir",
    "suvenior": "souvenir",
    "suveniors": "souvenirs",
    "swaer": "swear",
    "swaers": "swears",
    "sweeped": "swept",
    "sweept": "swept",
    "swein": "swine",
    "swiming": "swimming",
    "swimtrunk": "swim trunk",
    "Switerland": "Switzerland",
    "syas": "says",
    "syle": "style",
    "sylibol": "syllable",
    "symetric": "symmetric",
    "symetrically": "symmetrically",
    "symetry": "symmetry",
    "symmetral": "symmetric",
    "symmetricaly": "symmetrically",
    "synonomous": "synonymous",
    "syphyllis": "syphilis",
    "syrap": "syrup",
    "sysmograph": "seismograph",
    "tabacco": "tobacco",
    "tabblow": "tableau",
    "talekd": "talked",
    "talkign": "talking",
    "tamacoochi": "tamagotchi",
    "tandori": "Tandoori",
    "targetted": "targeted",
    "targetting": "targeting",
    "tarmigan": "ptarmigan",
    "tarpolin": "tarpaulin",
    "tarten": "tartan",
    "tartens": "tartans",
    "tast": "taste",
    "tastful": "tasteful",
    "tatoo": "tattoo",
    "tattooes": "tattoos",
    "tawk": "talk",
    "taxanomic": "taxonomic",
    "taxanomy": "taxonomy",
    "tea cup": "teacup",
    "teached": "taught",
    "teamate": "teammate",
    "techician": "technician",
    "techicians": "technicians",
    "techneek": "technique",
    "technition": "technician",
    "tecnical": "technical",
    "tedeous": "tedious",
    "tehy": "they",
    "telphone": "telephone",
    "temerature": "temperature",
    "temeratures": "temperatures",
    "tempale": "temple",
    "tempales": "temples",
    "temparate": "temperate",
    "tempel": "temple",
    "tempels": "temples",
    "temperary": "temporary",
    "temperment": "temperament",
    "tempermental": "temperamental",
    "temperture": "temperature",
    "tempoerature": "temperature",
    "tempurture": "temperature",
    "temtation": "temptation",
    "tenacle": "tentacle",
    "tenacles": "tentacles",
    "tendancies": "tendencies",
    "tendancy": "tendency",
    "tenn.": "Tennessee",
    "tequial": "tequila",
    "terace": "terrace",
    "teridactyl": "pterodactyl",
    "terific": "terrific",
    "teritory": "territory",
    "termoil": "turmoil",
    "ternament": "tournament",
    "terrable": "terrible",
    "terrase": "terrace",
    "terrases": "terraces",
    "terrasse": "terrace",
    "terrestial": "terrestrial",
    "terriories": "territories",
    "terriory": "territory",
    "territorist": "terrorist",
    "testamonial": "testimonial",
    "testamony": "testimony",
    "testement": "testament",
    "testical": "testicle",
    "testiment": "testament",
    "Teusday": "Tuesday",
    "tey": "they",
    "tghis": "this",
    "thansk": "thanks",
    "thatt": "he",
    "thatthe": "that",
    "theer": "there",
    "theerafter": "thereafter",
    "theery": "theory",
    "theif": "thief",
    "theifs": "thieves",
    "theives": "thieves",
    "thell": "tell",
    "ther": "there",
    "theraputic": "therapeutic",
    "therby": "thereby",
    "therem": "theorem",
    "theri": "their",
    "theroretical": "theoretical",
    "thign": "thing",
    "thigns": "things",
    "thigsn": "things",
    "thikn": "think",
    "thikns": "thinks",
    "thimk": "think",
    "thingamajig": "thing",
    "thingie": "thing",
    "thingking": "thinking",
    "thingy": "thing",
    "thirtyth": "thirtieth",
    "thisle": "thistle",
    "thna": "than",
    "thne": "then",
    "thnig": "thing",
    "thnigs": "things",
    "thoguht": "thought",
    "thougth": "thought",
    "threatend": "threatened",
    "threshhold": "threshold",
    "threshholds": "thresholds",
    "thrid": "third",
    "throug": "through",
    "through out": "throughout",
    "throughfare": "thoroughfare",
    "throughly": "thoroughly",
    "throughtout": "throughout",
    "throuhg": "through",
    "thrusted": "thrust",
    "thrsday": "Thursday",
    "tihkn": "think",
    "timne": "time",
    "tiny speck": "speck",
    "tiogether": "together",
    "tipic": "typical",
    "tipical": "typical",
    "tipycal": "typical",
    "tje": "the",
    "teh": "the",
    "tkae": "take",
    "tkaes": "takes",
    "tkaing": "taking",
    "tlaking": "talking",
    "tobbaco": "tobacco",
    "tocksen": "toxin",
    "todya": "today",
    "togehter": "together",
    "toilett": "toilet",
    "tolerence": "tolerance",
    "Tolkein": "Tolkien",
    "tolstoi": "Tolstoy",
    "tomatoe": "tomato",
    "tomatos": "tomatoes",
    "tommorow": "tomorrow",
    "tommorrow": "tomorrow",
    "tomorow": "tomorrow",
    "tongiht": "tonight",
    "tonihgt": "tonight",
    "toom": "tomb",
    "Tootonic": "Teutonic",
    "toriodal": "toroidal",
    "tork": "torque",
    "tornados": "tornadoes",
    "tornament": "tournament",
    "torpedos": "torpedoes",
    "tortilini": "tortellini",
    "tortise": "tortoise",
    "tounge": "tongue",
    "tourit": "tourist",
    "tourits": "tourists",
    "toursists": "tourists",
    "towrad": "toward",
    "toxen": "toxin",
    "tradgedy": "tragedy",
    "tradgic": "tragic",
    "traditionaly": "traditionally",
    "traditionalyl": "traditionally",
    "traditionnal": "traditional",
    "trafficed": "trafficked",
    "trafficing": "trafficking",
    "traffick": "traffic",
    "trafic": "traffic",
    "trama": "trauma",
    "trancendent": "transcendent",
    "trancending": "transcending",
    "tranform": "transform",
    "tranformed": "transformed",
    "tranport": "transport",
    "transcendance": "transcendence",
    "transcendant": "transcendent",
    "transcendentational": "transcendental",
    "transcept": "transept",
    "transending": "transcending",
    "transfered": "transferred",
    "transfering": "transferring",
    "transister": "transistor",
    "transistion": "transition",
    "transitor": "transistor",
    "translater": "translator",
    "translaters": "translators",
    "transmision": "transmission",
    "transmissable": "transmissible",
    "transparenet": "transparent",
    "transsend": "transcend",
    "traslate": "translate",
    "traslated": "translated",
    "trasport": "transport",
    "trasportation": "transportation",
    "travelling": "traveling",
    "travler": "traveler",
    "travlers": "travelers",
    "tremelo": "tremolo",
    "tremelos": "tremolos",
    "treshold": "threshold",
    "trew": "true",
    "triathalon": "triathlon",
    "trignametric": "trigonometric",
    "tringket": "trinket",
    "triology": "trilogy",
    "troglodite": "troglodyte",
    "troley": "trolley",
    "trolly": "trolley",
    "trubador": "troubadour",
    "truely": "truly",
    "truging": "trudging",
    "truley": "truly",
    "trustworthyness": "trustworthiness",
    "tryed": "tried",
    "trys": "tries",
    "tshirt": "t-shirt",
    "tthe": "the",
    "tucan": "toucan",
    "tung": "tongue",
    "turain": "terrain",
    "turist": "tourist",
    "turists": "tourists",
    "turkies": "turkeys",
    "turkoise": "turquoise",
    "turqoise": "turquoise",
    "Turring": "Turing",
    "Tuscon": "Tucson",
    "twelth": "twelfth",
    "tym": "time",
    "typcial": "typical",
    "typic": "typical",
    "typicaly": "typically",
    "tyranies": "tyrannies",
    "tyrany": "tyranny",
    "tyrranies": "tyrannies",
    "tyrrany": "tyranny",
    "ubiqitous": "ubiquitous",
    "ubiquitious": "ubiquitous",
    "udnerstand": "understand",
    "Ukrane": "Ukraine",
    "unaccesabel": "inaccessible",
    "unaccesabele": "inaccessible",
    "unaccesable": "inaccessible",
    "unaccesibel": "inaccessible",
    "unaccesibele": "inaccessible",
    "unaccesible": "inaccessible",
    "unaccessabel": "inaccessible",
    "unaccessabele": "inaccessible",
    "unaccessable": "inaccessible",
    "unaccessibel": "inaccessible",
    "unaccessibele": "inaccessible",
    "unaccessible": "inaccessible",
    "unacesabel": "inaccessible",
    "unacesabele": "inaccessible",
    "unacesable": "inaccessible",
    "unacesibel": "inaccessible",
    "unacesibele": "inaccessible",
    "unacesible": "inaccessible",
    "unacessabel": "inaccessible",
    "unacessabele": "inaccessible",
    "unacessable": "inaccessible",
    "unacessibel": "inaccessible",
    "unacessibele": "inaccessible",
    "unacessible": "inaccessible",
    "unannomus": "unanimous",
    "uncautious": "incautious",
    "uncertainity": "uncertainty",
    "unconcious": "unconscious",
    "unconciousness": "unconsciousness",
    "unconvential": "unconventional",
    "undecideable": "undecidable",
    "under wear": "underwear",
    "undergound": "underground",
    "understnad": "understand",
    "undertand": "understand",
    "underware": "underwear",
    "undesireable": "undesirable",
    "undevelopment": "underdevelopment",
    "unduely": "unduly",
    "unecessary": "unnecessary",
    "uneffected": "unaffected",
    "unexeceptional": "unexceptional",
    "unfeasable": "unfeasible",
    "unforgetable": "unforgettable",
    "unilatreal": "unilateral",
    "unilatreally": "unilaterally",
    "univeristies": "universities",
    "univeristy": "university",
    "universties": "universities",
    "univesities": "universities",
    "univesity": "university",
    "unlabled": "unlabeled",
    "unliek": "unlike",
    "unlikley": "unlikely",
    "unmistakeably": "unmistakably",
    "unneccesarily": "unnecessarily",
    "unneccesary": "unnecessary",
    "unneccessarily": "unnecessarily",
    "unneccessary": "unnecessary",
    "unnecesarily": "unnecessarily",
    "unnecesary": "unnecessary",
    "unnemployment": "unemployment",
    "unoticeable": "unnoticeable",
    "unphased": "unfazed",
    "unpleasent": "unpleasant",
    "unpleasently": "unpleasantly",
    "unplesant": "unpleasant",
    "unrepentent": "unrepentant",
    "unsubstanciated": "unsubstantiated",
    "unsuccessfull": "unsuccessful",
    "unsucesful": "unsuccessful",
    "unsucesfuly": "unsuccessfully",
    "unsucessfull": "unsuccessful",
    "unsucessfully": "unsuccessfully",
    "unsuprised": "unsurprised",
    "unsuprising": "unsurprising",
    "unsuprisingly": "unsurprisingly",
    "unsuprized": "unsurprised",
    "unsuprizing": "unsurprising",
    "unsuprizingly": "unsurprisingly",
    "unsurprized": "unsurprised",
    "unsurprizing": "unsurprising",
    "unsurprizingly": "unsurprisingly",
    "untill": "until",
    "untranslateable": "untranslatable",
    "unviersities": "universities",
    "unviersity": "university",
    "unviersty": "university",
    "unweildly": "unwieldy",
    "unwieldly": "unwieldy",
    "uphil": "uphill",
    "usally": "usually",
    "useage": "usage",
    "usefull": "useful",
    "usefuly": "usefully",
    "useing": "using",
    "usibility": "usability",
    "usuall": "usual",
    "usualy": "usually",
    "usualyl": "usually",
    "utilizied": "utilized",
    "vaccum": "vacuum",
    "vaccume": "vacuum",
    "vacinity": "vicinity",
    "vacume": "vacuum",
    "vallay": "valet",
    "valuble": "valuable",
    "valubles": "valuables",
    "valueable": "valuable",
    "valueables": "valuables",
    "Vancover": "Vancouver",
    "vant": "want",
    "variaties": "varieties",
    "variaty": "variety",
    "variatys": "varieties",
    "varient": "variant",
    "varietys": "varieties",
    "varification": "verification",
    "varisty": "varsity",
    "varities": "varieties",
    "varity": "variety",
    "varous": "various",
    "vasal": "vassal",
    "vasall": "vassal",
    "vasalls": "vassals",
    "vasals": "vassals",
    "vaudville": "vaudeville",
    "veamant": "vehement",
    "veganisim": "veganism",
    "vegatable": "vegetable",
    "vegatables": "vegetables",
    "vegatarian": "vegetarian",
    "vegatarians": "vegetarians",
    "vegitable": "vegetable",
    "vegitables": "vegetables",
    "vegitarian": "vegetarian",
    "vegitarians": "vegetarians",
    "vegitarion": "vegetarian",
    "vegtable": "vegetable",
    "veicle": "vehicle",
    "veiw": "view",
    "veiws": "views",
    "vender": "vendor",
    "venders": "vendors",
    "venemous": "venomous",
    "vengance": "vengeance",
    "vengence": "vengeance",
    "ventillate": "ventilate",
    "venyet": "vignette",
    "veragated": "variegated",
    "verbage": "verbiage",
    "verbatum": "verbatim",
    "verchew": "virtue",
    "verfication": "verification",
    "veriasion": "variation",
    "verison": "version",
    "verisons": "versions",
    "vermen": "vermin",
    "vermillion": "vermilion",
    "vermuth": "vermouth",
    "versimilitude": "verisimilitude",
    "versital": "versatile",
    "versitle": "versatile",
    "vetinarian": "veterinarian",
    "vetran": "veteran",
    "vetrans": "veterans",
    "vetween": "between",
    "victum": "victim",
    "vigilanty": "vigilante",
    "vigilence": "vigilance",
    "vigilent": "vigilant",
    "vigourous": "vigorous",
    "vilage": "village",
    "villian": "villain",
    "villified": "vilified",
    "villify": "vilify",
    "vinagrette": "vinaigrette",
    "vinagrettes": "vinaigrette",
    "vinal": "vinyl",
    "vincinity": "vicinity",
    "vinigar": "vinegar",
    "vinigarette": "vinaigrette",
    "vinyard": "vineyard",
    "vinyards": "vineyards",
    "vinyet": "vignette",
    "Virgina": "Virginia",
    "virii": "viruses",
    "virtualyl": "virtually",
    "visa versa": "vice-versa",
    "visability": "visibility",
    "visable": "visible",
    "visably": "visibly",
    "visheate": "vitiate",
    "vishus": "vicious",
    "vist": "visit",
    "vistation": "visitation",
    "visting": "visiting",
    "vistor": "visitor",
    "vistors": "visitors",
    "visualisation": "visualization",
    "vitually": "virtually",
    "vodochka": "vodka",
    "volcan": "volcano",
    "volcanoe": "volcano",
    "volcanos": "volcanoes",
    "volentier": "volunteer",
    "Volkswagon": "Volkswagen",
    "volontary": "voluntary",
    "volonteer": "volunteer",
    "volonteered": "volunteered",
    "volonteering": "volunteering",
    "volonteers": "volunteers",
    "volor": "color",
    "volounteer": "volunteer",
    "volounteered": "volunteered",
    "volounteering": "volunteering",
    "volounteers": "volunteers",
    "vulcano": "volcano",
    "vulcanoes": "volcanoes",
    "vulcanos": "volcanoes",
    "vulnerible": "vulnerable",
    "vunerable": "vulnerable",
    "walet": "wallet",
    "walett": "wallet",
    "wallett": "wallet",
    "warey": "wary",
    "warfarre": "warfare",
    "warrent": "warrant",
    "wass": "was",
    "wat": "what",
    "waterfal": "waterfall",
    "waterfals": "waterfalls",
    "watn": "want",
    "weaponary": "weaponry",
    "weathly": "wealthy",
    "weev": "weave",
    "weild": "wield",
    "weilded": "wielded",
    "weilding": "wielding",
    "wendsay": "Wednesday",
    "wendsday": "Wednesday",
    "wensday": "Wednesday",
    "weppon": "weapon",
    "werre": "were",
    "wesal": "weasel",
    "whad": "what",
    "whant": "want",
    "whants": "wants",
    "whare": "where",
    "whatsisname": "him",
    "whatsit": "thing",
    "wheater": "weather",
    "wheather": "weather",
    "whent": "went",
    "wher": "where",
    "wheras": "whereas",
    "where as": "whereas",
    "where by": "whereby",
    "where upon": "whereupon",
    "whereever": "wherever",
    "wherre": "where",
    "whilst": "while",
    "whit": "with",
    "whith": "with",
    "whoes": "whose",
    "wholely": "wholly",
    "wholey": "wholly",
    "wholistic": "holistic",
    "wholley": "wholly",
    "whre": "where",
    "whta": "what",
    "wich": "which",
    "wief": "wife",
    "wierd": "weird",
    "wiht": "with",
    "wildebeast": "wildebeest",
    "winarie": "winery",
    "winary": "winery",
    "winarys": "wineries",
    "windoes": "windows",
    "winerys": "wineries",
    "wineyard": "vineyard",
    "wineyards": "vineyards",
    "winyard": "vineyard",
    "winyards": "vineyards",
    "wirting": "writing",
    "Wisconson": "Wisconsin",
    "wisper": "whisper",
    "wissle": "whistle",
    "with out": "without",
    "withdrawl": "withdrawal",
    "withold": "withhold",
    "wizzing": "whizzing",
    "wnats": "wants",
    "woh": "who",
    "wohle": "whole",
    "wokr": "work",
    "wokring": "working",
    "wolwerine": "wolverine",
    "wonderfull": "wonderful",
    "wonderous": "wondrous",
    "worderfull": "wonderful",
    "worstened": "worsened",
    "worstening": "worsening",
    "worth while": "worthwhile",
    "worthwile": "worthwhile",
    "wot": "what",
    "woud": "would",
    "woudl": "would",
    "wressel": "wrestle",
    "wriet": "write",
    "writeable": "writable",
    "writen": "written",
    "writting": "writing",
    "wrldwide": "worldwide",
    "wroet": "wrote",
    "ws": "was",
    "wut": "what",
    "ya": "you",
    "yerself": "yourself",
    "yoruself": "yourself",
    "yot": "yacht",
    "absorbant": "absorbent",
    "wroking": "working",
    "wroten": "written",
    "wunderful": "wonderful",
    "wupport": "support",
    "yamaka": "yarmulke",
    "yatch": "yacht",
    "yeasr": "years",
    "yeild": "yield",
    "yello": "yellow",
    "yelow": "yellow",
    "yera": "year",
    "yeras": "years",
    "yoman": "yeoman",
    "youforic": "euphoric",
    "youlogy": "eulogy",
    "youthinasia": "euthanasia",
    "yuforic": "euphoric",
    "yuonger": "younger",
    "zar": "czar",
    "zeebra": "zebra",
    "zefer": "zephyr",
    "zellot": "zealot",
    "zink": "zinc",
    "zookeenee": "zucchini",
    "zylophone": "xylophone",
    "'n": "and",
    "'bot": "robot",
    "'bout": "about",
    "'cause": "because",
    "'cept": "except",
    "'cuz": "because",
    "'d better": "I had better",
    "'em": "them",
    "'fore": "before",
    "'fraid": "afraid",
    "'gainst": "against",
    "'hood": "neighborhood",
    "'kay": "yes",
    "'ll": "will",
    "'m": "am",
    "'mongst": "amongst",
    "'neath": "beneath",
    "'nuff": "enough",
    "'pon": "upon",
    "'re": "areo",
    "'round": "around",
    "'scuse": "excuse",
    "'sup": "what is up",
    "'taint": "it is not",
    "'til": "until",
    "'tis": "it is",
    "'tisn't": "it is not",
    "'twas": "it was",
    "'twasn't": "it was not",
    "'tween": "between",
    "'twere": "it were",
    "'tweren't": "it were not",
    "'twill": "it will",
    "'twould": "it would",
    "'ve": "have",
    "'way": "away",
    "accessorise": "accessorize",
    "accessorised": "accessorized",
    "accessorises": "accessorizes",
    "accessorising": "accessorizing",
    "acclimatisation": "acclimatization",
    "acclimatise": "acclimatize",
    "acclimatised": "acclimatized",
    "acclimatises": "acclimatizes",
    "acclimatising": "acclimatizing",
    "accoutrements": "accouterments",
    "aeon": "eon",
    "aeons": "eons",
    "aerogramme": "aerogram",
    "aerogrammes": "aerograms",
    "jewellery": "jewelry",
    "aesthete": "esthete",
    "aesthetes": "esthetes",
    "aetiology": "etiology",
    "ageing": "aging",
    "aggrandisement": "aggrandizement",
    "agonise": "agonize",
    "agonised": "agonized",
    "agonises": "agonizes",
    "agonising": "agonizing",
    "agonisingly": "agonizingly",
    "almanack": "almanac",
    "almanacks": "almanacs",
    "aluminium": "aluminum",
    "amortisable": "amortizable",
    "amortisation": "amortization",
    "amortisations": "amortizations",
    "amortise": "amortize",
    "amortised": "amortized",
    "amortises": "amortizes",
    "amortising": "amortizing",
    "amphitheatre": "amphitheater",
    "amphitheatres": "amphitheaters",
    "anaemia": "anemia",
    "anaemic": "anemic",
    "anaesthesia": "anesthesia",
    "anaesthetic": "anesthetic",
    "anaesthetics": "anesthetics",
    "anaesthetise": "anesthetize",
    "anaesthetised": "anesthetized",
    "anaesthetises": "anesthetizes",
    "anaesthetising": "anesthetizing",
    "anaesthetist": "anesthetist",
    "anaesthetists": "anesthetists",
    "anaesthetize": "anesthetize",
    "anaesthetized": "anesthetized",
    "anaesthetizes": "anesthetizes",
    "anaesthetizing": "anesthetizing",
    "analogue": "analog",
    "analogues": "analogs",
    "analysed": "analyzed",
    "analyses": "analyzes",
    "analysing": "analyzing",
    "anglicise": "anglicize",
    "anglicised": "anglicized",
    "anglicises": "anglicizes",
    "anglicising": "anglicizing",
    "annualised": "annualized",
    "antagonise": "antagonize",
    "antagonised": "antagonized",
    "antagonises": "antagonizes",
    "antagonising": "antagonizing",
    "apologises": "apologizes",
    "apologising": "apologizing",
    "appal": "appall",
    "appals": "appalls",
    "appetiser": "appetizer",
    "appetisers": "appetizers",
    "appetising": "appetizing",
    "appetisingly": "appetizingly",
    "arbour": "arbor",
    "arbours": "arbors",
    "ardour": "ardor",
    "armour": "armor",
    "armoured": "armored",
    "armourer": "armorer",
    "armourers": "armorers",
    "armouries": "armories",
    "armoury": "armory",
    "artefact": "artifact",
    "artefacts": "artifacts",
    "authorise": "authorize",
    "authorised": "authorized",
    "authorises": "authorizes",
    "authorising": "authorizing",
    "axe": "ax",
    "backpedalled": "backpedaled",
    "backpedalling": "backpedaling",
    "bannister": "banister",
    "bannisters": "banisters",
    "baptise": "baptize",
    "baptised": "baptized",
    "baptises": "baptizes",
    "baptising": "baptizing",
    "bastardise": "bastardize",
    "bastardised": "bastardized",
    "bastardises": "bastardizes",
    "bastardising": "bastardizing",
    "battleaxe": "battleax",
    "baulk": "balk",
    "baulked": "balked",
    "baulking": "balking",
    "baulks": "balks",
    "bedevilled": "bedeviled",
    "bedevilling": "bedeviling",
    "behaviour": "behavior",
    "behavioural": "behavioral",
    "behaviourism": "behaviorism",
    "behaviourist": "behaviorist",
    "behaviourists": "behaviorists",
    "behaviours": "behaviors",
    "behove": "behoove",
    "behoved": "behooved",
    "behoves": "behooves",
    "bejewelled": "bejeweled",
    "belabour": "belabor",
    "belaboured": "belabored",
    "belabouring": "belaboring",
    "belabours": "belabors",
    "bevelled": "beveled",
    "bevvies": "bevies",
    "bevvy": "bevy",
    "biassed": "biased",
    "biassing": "biasing",
    "bingeing": "binging",
    "bougainvillaea": "bougainvillea",
    "bougainvillaeas": "bougainvilleas",
    "bowdlerise": "bowdlerize",
    "bowdlerised": "bowdlerized",
    "bowdlerises": "bowdlerizes",
    "bowdlerising": "bowdlerizing",
    "breathalyse": "breathalyze",
    "breathalysed": "breathalyzed",
    "breathalyser": "breathalyzer",
    "breathalysers": "breathalyzers",
    "breathalyses": "breathalyzes",
    "breathalysing": "breathalyzing",
    "brutalise": "brutalize",
    "brutalised": "brutalized",
    "brutalises": "brutalizes",
    "brutalising": "brutalizing",
    "buses": "busses",
    "busing": "bussing",
    "caesarean": "cesarean",
    "caesareans": "cesareans",
    "calibre": "caliber",
    "calibres": "calibers",
    "calliper": "caliper",
    "callipers": "calipers",
    "callisthenics": "calisthenics",
    "canalise": "canalize",
    "canalised": "canalized",
    "canalises": "canalizes",
    "canalising": "canalizing",
    "cancellation": "cancelation",
    "cancellations": "cancelations",
    "cancelled": "canceled",
    "cancelling": "canceling",
    "candour": "candor",
    "cannibalise": "cannibalize",
    "cannibalised": "cannibalized",
    "cannibalises": "cannibalizes",
    "cannibalising": "cannibalizing",
    "canonise": "canonize",
    "canonised": "canonized",
    "canonises": "canonizes",
    "canonising": "canonizing",
    "capitalise": "capitalize",
    "capitalised": "capitalized",
    "capitalises": "capitalizes",
    "capitalising": "capitalizing",
    "caramelise": "caramelize",
    "caramelised": "caramelized",
    "caramelises": "caramelizes",
    "caramelising": "caramelizing",
    "carbonise": "carbonize",
    "carbonised": "carbonized",
    "carbonises": "carbonizes",
    "carbonising": "carbonizing",
    "carolled": "caroled",
    "carolling": "caroling",
    "catalogue": "catalog",
    "catalogued": "cataloged",
    "catalogues": "catalogs",
    "cataloguing": "cataloging",
    "catalyse": "catalyze",
    "catalysed": "catalyzed",
    "catalyses": "catalyzes",
    "catalysing": "catalyzing",
    "categorise": "categorize",
    "categorised": "categorized",
    "categorises": "categorizes",
    "categorising": "categorizing",
    "cauterise": "cauterize",
    "cauterised": "cauterized",
    "cauterises": "cauterizes",
    "cauterising": "cauterizing",
    "cavilled": "caviled",
    "cavilling": "caviling",
    "centigramme": "centigram",
    "centigrammes": "centigrams",
    "centilitre": "centiliter",
    "centilitres": "centiliters",
    "centimetre": "centimeter",
    "centimetres": "centimeters",
    "centralise": "centralize",
    "centralised": "centralized",
    "centralises": "centralizes",
    "centralising": "centralizing",
    "centre": "center",
    "centred": "centered",
    "centrefold": "centerfold",
    "centrefolds": "centerfolds",
    "centrepiece": "centerpiece",
    "centrepieces": "centerpieces",
    "centres": "centers",
    "channelled": "channeled",
    "channelling": "channeling",
    "characterise": "characterize",
    "characterised": "characterized",
    "characterises": "characterizes",
    "characterising": "characterizing",
    "cheque": "check",
    "chequebook": "checkbook",
    "chequebooks": "checkbooks",
    "chequered": "checkered",
    "cheques": "checks",
    "chilli": "chili",
    "chimaera": "chimera",
    "chimaeras": "chimeras",
    "chiselled": "chiseled",
    "chiselling": "chiseling",
    "circularise": "circularize",
    "circularised": "circularized",
    "circularises": "circularizes",
    "circularising": "circularizing",
    "civilise": "civilize",
    "civilised": "civilized",
    "civilises": "civilizes",
    "civilising": "civilizing",
    "clamour": "clamor",
    "clamoured": "clamored",
    "clamouring": "clamoring",
    "clamours": "clamors",
    "clangour": "clangor",
    "clarinettist": "clarinetist",
    "clarinettists": "clarinetists",
    "collectivise": "collectivize",
    "collectivised": "collectivized",
    "collectivises": "collectivizes",
    "collectivising": "collectivizing",
    "colonisation": "colonization",
    "colonise": "colonize",
    "colonised": "colonized",
    "coloniser": "colonizer",
    "colonisers": "colonizers",
    "colonises": "colonizes",
    "colonising": "colonizing",
    "colour": "color",
    "colourant": "colorant",
    "colourants": "colorants",
    "coloured": "colored",
    "coloureds": "coloreds",
    "colourfully": "colorfully",
    "colouring": "coloring",
    "colourized": "colorized",
    "colourizes": "colorizes",
    "colourizing": "colorizing",
    "colourless": "colorless",
    "colours": "colors",
    "commercialise": "commercialize",
    "commercialised": "commercialized",
    "commercialises": "commercializes",
    "commercialising": "commercializing",
    "compartmentalise": "compartmentalize",
    "compartmentalised": "compartmentalized",
    "compartmentalises": "compartmentalizes",
    "compartmentalising": "compartmentalizing",
    "computerise": "computerize",
    "computerised": "computerized",
    "computerises": "computerizes",
    "computerising": "computerizing",
    "conceptualise": "conceptualize",
    "conceptualised": "conceptualized",
    "conceptualises": "conceptualizes",
    "conceptualising": "conceptualizing",
    "connexions": "connections",
    "contextualise": "contextualize",
    "contextualised": "contextualized",
    "contextualises": "contextualizes",
    "contextualising": "contextualizing",
    "cosier": "cozier",
    "cosies": "cozies",
    "cosiest": "coziest",
    "cosily": "cozily",
    "cosiness": "coziness",
    "cosy": "cozy",
    "councillor": "councilor",
    "councillors": "councilors",
    "counselled": "counseled",
    "counselling": "counseling",
    "counsellor": "counselor",
    "counsellors": "counselors",
    "crenellated": "crenelated",
    "criminalise": "criminalize",
    "criminalised": "criminalized",
    "criminalises": "criminalizes",
    "criminalising": "criminalizing",
    "criticise": "criticize",
    "criticised": "criticized",
    "criticises": "criticizes",
    "criticising": "criticizing",
    "crueller": "crueler",
    "cruellest": "cruelest",
    "crystallisation": "crystallization",
    "crystallise": "crystallize",
    "crystallised": "crystallized",
    "crystallises": "crystallizes",
    "crystallising": "crystallizing",
    "cudgelled": "cudgeled",
    "cudgelling": "cudgeling",
    "customise": "customize",
    "customised": "customized",
    "customises": "customizes",
    "customising": "customizing",
    "cypher": "cipher",
    "cyphers": "ciphers",
    "decentralisation": "decentralization",
    "decentralise": "decentralize",
    "decentralised": "decentralized",
    "decentralises": "decentralizes",
    "decentralising": "decentralizing",
    "decriminalisation": "decriminalization",
    "decriminalise": "decriminalize",
    "decriminalised": "decriminalized",
    "decriminalises": "decriminalizes",
    "decriminalising": "decriminalizing",
    "defence": "defense",
    "defenceless": "defenseless",
    "defences": "defenses",
    "dehumanisation": "dehumanization",
    "dehumanise": "dehumanize",
    "dehumanised": "dehumanized",
    "dehumanises": "dehumanizes",
    "dehumanising": "dehumanizing",
    "demeanour": "demeanor",
    "demilitarisation": "demilitarization",
    "demilitarise": "demilitarize",
    "demilitarised": "demilitarized",
    "demilitarises": "demilitarizes",
    "demilitarising": "demilitarizing",
    "demobilisation": "demobilization",
    "demobilise": "demobilize",
    "demobilised": "demobilized",
    "demobilises": "demobilizes",
    "demobilising": "demobilizing",
    "democratisation": "democratization",
    "democratise": "democratize",
    "democratised": "democratized",
    "democratises": "democratizes",
    "democratising": "democratizing",
    "demonise": "demonize",
    "demonised": "demonized",
    "demonises": "demonizes",
    "demonising": "demonizing",
    "demoralisation": "demoralization",
    "demoralise": "demoralize",
    "demoralised": "demoralized",
    "demoralises": "demoralizes",
    "demoralising": "demoralizing",
    "denationalisation": "denationalization",
    "denationalise": "denationalize",
    "denationalised": "denationalized",
    "denationalises": "denationalizes",
    "denationalising": "denationalizing",
    "deodorise": "deodorize",
    "deodorised": "deodorized",
    "deodorises": "deodorizes",
    "deodorising": "deodorizing",
    "depersonalise": "depersonalize",
    "depersonalised": "depersonalized",
    "depersonalises": "depersonalizes",
    "depersonalising": "depersonalizing",
    "deputise": "deputize",
    "deputised": "deputized",
    "deputises": "deputizes",
    "deputising": "deputizing",
    "desensitisation": "desensitization",
    "desensitise": "desensitize",
    "desensitised": "desensitized",
    "desensitises": "desensitizes",
    "desensitising": "desensitizing",
    "destabilisation": "destabilization",
    "destabilise": "destabilize",
    "destabilised": "destabilized",
    "destabilises": "destabilizes",
    "destabilising": "destabilizing",
    "dialled": "dialed",
    "dialling": "dialing",
    "dialogue": "dialog",
    "dialogues": "dialogs",
    "diarrhoea": "diarrhea",
    "digitise": "digitize",
    "digitised": "digitized",
    "digitises": "digitizes",
    "digitising": "digitizing",
    "disc": "disk",
    "discolour": "discolor",
    "discoloured": "discolored",
    "discolouring": "discoloring",
    "discolours": "discolors",
    "discs": "disks",
    "disembowelled": "disemboweled",
    "disembowelling": "disemboweling",
    "disfavour": "disfavor",
    "dishevelled": "disheveled",
    "dishonour": "dishonor",
    "dishonourable": "dishonorable",
    "dishonourably": "dishonorably",
    "dishonoured": "dishonored",
    "dishonouring": "dishonoring",
    "dishonours": "dishonors",
    "disorganisation": "disorganization",
    "disorganised": "disorganized",
    "distill": "distil",
    "distills": "distils",
    "dramatisation": "dramatization",
    "dramatisations": "dramatizations",
    "dramatise": "dramatize",
    "dramatised": "dramatized",
    "dramatises": "dramatizes",
    "dramatising": "dramatizing",
    "draught": "draft",
    "draughtboard": "draftboard",
    "draughtboards": "draftboards",
    "draughtier": "draftier",
    "draughtiest": "draftiest",
    "draughts": "drafts",
    "draughtsman": "draftsman",
    "draughtsmanship": "draftsmanship",
    "draughtsmen": "draftsmen",
    "draughtswoman": "draftswoman",
    "draughtswomen": "draftswomen",
    "draughty": "drafty",
    "drivelled": "driveled",
    "drivelling": "driveling",
    "duelled": "dueled",
    "duelling": "dueling",
    "economise": "economize",
    "economised": "economized",
    "economises": "economizes",
    "economising": "economizing",
    "edoema": "edema",
    "editorialise": "editorialize",
    "editorialised": "editorialized",
    "editorialises": "editorializes",
    "editorialising": "editorializing",
    "empathise": "empathize",
    "empathised": "empathized",
    "empathises": "empathizes",
    "empathising": "empathizing",
    "emphasise": "emphasize",
    "emphasised": "emphasized",
    "emphasises": "emphasizes",
    "emphasising": "emphasizing",
    "enamelled": "enameled",
    "enamelling": "enameling",
    "encyclopaedia": "encyclopedia",
    "encyclopaedias": "encyclopedias",
    "encyclopaedic": "encyclopedic",
    "endeavour": "endeavor",
    "endeavoured": "endeavored",
    "endeavouring": "endeavoring",
    "endeavours": "endeavors",
    "energise": "energize",
    "energised": "energized",
    "energises": "energizes",
    "energising": "energizing",
    "enrol": "enroll",
    "enrols": "enrolls",
    "enthral": "enthrall",
    "enthrals": "enthralls",
    "epaulette": "epaulet",
    "epaulettes": "epaulets",
    "epicentre": "epicenter",
    "epicentres": "epicenters",
    "epilogue": "epilog",
    "epilogues": "epilogs",
    "epitomise": "epitomize",
    "epitomised": "epitomized",
    "epitomises": "epitomizes",
    "epitomising": "epitomizing",
    "equalisation": "equalization",
    "equalise": "equalize",
    "equalised": "equalized",
    "equaliser": "equalizer",
    "equalisers": "equalizers",
    "equalises": "equalizes",
    "equalising": "equalizing",
    "eulogise": "eulogize",
    "eulogised": "eulogized",
    "eulogises": "eulogizes",
    "eulogising": "eulogizing",
    "evangelise": "evangelize",
    "evangelised": "evangelized",
    "evangelises": "evangelizes",
    "evangelising": "evangelizing",
    "exorcise": "exorcize",
    "exorcised": "exorcized",
    "exorcises": "exorcizes",
    "exorcising": "exorcizing",
    "extemporisation": "extemporization",
    "extemporise": "extemporize",
    "extemporised": "extemporized",
    "extemporises": "extemporizes",
    "extemporising": "extemporizing",
    "externalisation": "externalization",
    "externalisations": "externalizations",
    "externalise": "externalize",
    "externalised": "externalized",
    "externalises": "externalizes",
    "externalising": "externalizing",
    "factorise": "factorize",
    "factorised": "factorized",
    "factorises": "factorizes",
    "factorising": "factorizing",
    "faecal": "fecal",
    "faeces": "feces",
    "familiarisation": "familiarization",
    "familiarise": "familiarize",
    "familiarised": "familiarized",
    "familiarises": "familiarizes",
    "familiarising": "familiarizing",
    "fantasise": "fantasize",
    "fantasised": "fantasized",
    "fantasises": "fantasizes",
    "fantasising": "fantasizing",
    "favour": "favor",
    "favourable": "favorable",
    "favourably": "favorably",
    "favoured": "favored",
    "favouring": "favoring",
    "favourites": "favorites",
    "favouritism": "favoritism",
    "feminise": "feminize",
    "feminised": "feminized",
    "feminises": "feminizes",
    "feminising": "feminizing",
    "fertilisation": "fertilization",
    "fertilise": "fertilize",
    "fertilised": "fertilized",
    "fertiliser": "fertilizer",
    "fertilisers": "fertilizers",
    "fertilises": "fertilizes",
    "fertilising": "fertilizing",
    "fervour": "fervor",
    "fibre": "fiber",
    "fibreglass": "fiberglass",
    "fibres": "fibers",
    "fictionalisation": "fictionalization",
    "fictionalisations": "fictionalizations",
    "fictionalise": "fictionalize",
    "fictionalised": "fictionalized",
    "fictionalises": "fictionalizes",
    "fictionalising": "fictionalizing",
    "fillet": "filet",
    "filleted": "fileted",
    "filleting": "fileting",
    "fillets": "filets",
    "finalisation": "finalization",
    "finalise": "finalize",
    "finalised": "finalized",
    "finalises": "finalizes",
    "finalising": "finalizing",
    "flautist": "flutist",
    "flautists": "flutists",
    "flavoured": "flavored",
    "flavouring": "flavoring",
    "flavourings": "flavorings",
    "flavourless": "flavorless",
    "flavoursome": "flavorsome",
    "foetal": "fetal",
    "foetid": "fetid",
    "foetus": "fetus",
    "foetuses": "fetuses",
    "formalisation": "formalization",
    "formalise": "formalize",
    "formalised": "formalized",
    "formalises": "formalizes",
    "formalising": "formalizing",
    "fossilisation": "fossilization",
    "fossilise": "fossilize",
    "fossilised": "fossilized",
    "fossilises": "fossilizes",
    "fossilising": "fossilizing",
    "fraternisation": "fraternization",
    "fraternise": "fraternize",
    "fraternised": "fraternized",
    "fraternises": "fraternizes",
    "fraternising": "fraternizing",
    "fulfil": "fulfill",
    "fulfilment": "fulfillment",
    "fulfils": "fulfills",
    "funnelled": "funneled",
    "funnelling": "funneling",
    "galvanise": "galvanize",
    "galvanised": "galvanized",
    "galvanises": "galvanizes",
    "galvanising": "galvanizing",
    "gambolled": "gamboled",
    "gambolling": "gamboling",
    "gaol": "jail",
    "gaolbird": "jailbird",
    "gaolbirds": "jailbirds",
    "gaolbreak": "jailbreak",
    "gaolbreaks": "jailbreaks",
    "gaoled": "jailed",
    "gaoler": "jailer",
    "gaolers": "jailers",
    "gaoling": "jailing",
    "gaols": "jails",
    "gases": "gasses",
    "gauge": "gage",
    "gauged": "gaged",
    "gauges": "gages",
    "gauging": "gaging",
    "generalisation": "generalization",
    "generalisations": "generalizations",
    "generalise": "generalize",
    "generalised": "generalized",
    "generalises": "generalizes",
    "generalising": "generalizing",
    "ghettoise": "ghettoize",
    "ghettoised": "ghettoized",
    "ghettoises": "ghettoizes",
    "ghettoising": "ghettoizing",
    "gipsies": "gypsies",
    "glamorise": "glamorize",
    "glamorised": "glamorized",
    "glamorises": "glamorizes",
    "glamorising": "glamorizing",
    "glamour": "glamor",
    "globalisation": "globalization",
    "globalise": "globalize",
    "globalised": "globalized",
    "globalises": "globalizes",
    "globalising": "globalizing",
    "glueing": "gluing",
    "goitre": "goiter",
    "goitres": "goiters",
    "gonorrhoea": "gonorrhea",
    "gramme": "gram",
    "grammes": "grams",
    "gravelled": "graveled",
    "grey": "gray",
    "greyed": "grayed",
    "greying": "graying",
    "greyish": "grayish",
    "greyness": "grayness",
    "greys": "grays",
    "grovelled": "groveled",
    "grovelling": "groveling",
    "groyne": "groin",
    "groynes": "groins",
    "gruelling": "grueling",
    "gruellingly": "gruelingly",
    "gryphon": "griffin",
    "gryphons": "griffins",
    "gynaecological": "gynecological",
    "gynaecologist": "gynecologist",
    "gynaecologists": "gynecologists",
    "gynaecology": "gynecology",
    "haematological": "hematological",
    "haematologist": "hematologist",
    "haematologists": "hematologists",
    "haematology": "hematology",
    "haemoglobin": "hemoglobin",
    "haemophilia": "hemophilia",
    "haemophiliac": "hemophiliac",
    "haemophiliacs": "hemophiliacs",
    "haemorrhage": "hemorrhage",
    "haemorrhaged": "hemorrhaged",
    "haemorrhages": "hemorrhages",
    "haemorrhaging": "hemorrhaging",
    "haemorrhoids": "hemorrhoids",
    "harboured": "harbored",
    "harbouring": "harboring",
    "harmonisation": "harmonization",
    "harmonise": "harmonize",
    "harmonised": "harmonized",
    "harmonises": "harmonizes",
    "harmonising": "harmonizing",
    "homoeopath": "homeopath",
    "homoeopathic": "homeopathic",
    "homoeopaths": "homeopaths",
    "homoeopathy": "homeopathy",
    "homogenise": "homogenize",
    "homogenised": "homogenized",
    "homogenises": "homogenizes",
    "homogenising": "homogenizing",
    "honour": "honor",
    "honourable": "honorable",
    "honourably": "honorably",
    "honoured": "honored",
    "honouring": "honoring",
    "honours": "honors",
    "hospitalisation": "hospitalization",
    "hospitalise": "hospitalize",
    "hospitalised": "hospitalized",
    "hospitalises": "hospitalizes",
    "hospitalising": "hospitalizing",
    "humanise": "humanize",
    "humanised": "humanized",
    "humanises": "humanizes",
    "humanising": "humanizing",
    "humour": "humor",
    "humoured": "humored",
    "humouring": "humoring",
    "humourless": "humorless",
    "humours": "humors",
    "hybridise": "hybridize",
    "hybridised": "hybridized",
    "hybridises": "hybridizes",
    "hybridising": "hybridizing",
    "hypnotise": "hypnotize",
    "hypnotised": "hypnotized",
    "hypnotises": "hypnotizes",
    "hypnotising": "hypnotizing",
    "hypothesise": "hypothesize",
    "hypothesised": "hypothesized",
    "hypothesises": "hypothesizes",
    "hypothesising": "hypothesizing",
    "idealisation": "idealization",
    "idealise": "idealize",
    "idealised": "idealized",
    "idealises": "idealizes",
    "idealising": "idealizing",
    "idolise": "idolize",
    "idolised": "idolized",
    "idolises": "idolizes",
    "idolising": "idolizing",
    "immobilisation": "immobilization",
    "immobilise": "immobilize",
    "immobilised": "immobilized",
    "immobiliser": "immobilizer",
    "immobilisers": "immobilizers",
    "immobilises": "immobilizes",
    "immobilising": "immobilizing",
    "immortalise": "immortalize",
    "immortalised": "immortalized",
    "immortalises": "immortalizes",
    "immortalising": "immortalizing",
    "immunisation": "immunization",
    "immunise": "immunize",
    "immunised": "immunized",
    "immunises": "immunizes",
    "immunising": "immunizing",
    "impanelled": "impaneled",
    "impanelling": "impaneling",
    "imperilled": "imperiled",
    "imperilling": "imperiling",
    "individualise": "individualize",
    "individualised": "individualized",
    "individualises": "individualizes",
    "individualising": "individualizing",
    "industrialise": "industrialize",
    "industrialised": "industrialized",
    "industrialises": "industrializes",
    "industrialising": "industrializing",
    "inflexion": "inflection",
    "inflexions": "inflections",
    "initialled": "initialed",
    "initialling": "initialing",
    "instal": "install",
    "instalment": "installment",
    "instalments": "installments",
    "instals": "installs",
    "instil": "instill",
    "instils": "instills",
    "institutionalisation": "institutionalization",
    "institutionalise": "institutionalize",
    "institutionalised": "institutionalized",
    "institutionalises": "institutionalizes",
    "institutionalising": "institutionalizing",
    "intellectualise": "intellectualize",
    "intellectualised": "intellectualized",
    "intellectualises": "intellectualizes",
    "intellectualising": "intellectualizing",
    "internalisation": "internalization",
    "internalise": "internalize",
    "internalised": "internalized",
    "internalises": "internalizes",
    "internalising": "internalizing",
    "internationalisation": "internationalization",
    "internationalise": "internationalize",
    "internationalised": "internationalized",
    "internationalises": "internationalizes",
    "internationalising": "internationalizing",
    "ionisation": "ionization",
    "ionise": "ionize",
    "ionised": "ionized",
    "ioniser": "ionizer",
    "ionisers": "ionizers",
    "ionises": "ionizes",
    "ionising": "ionizing",
    "italicise": "italicize",
    "italicised": "italicized",
    "italicises": "italicizes",
    "italicising": "italicizing",
    "itemise": "itemize",
    "itemised": "itemized",
    "itemises": "itemizes",
    "itemising": "itemizing",
    "jeopardise": "jeopardize",
    "jeopardised": "jeopardized",
    "jeopardises": "jeopardizes",
    "jeopardising": "jeopardizing",
    "jewelled": "jeweled",
    "jeweller": "jeweler",
    "jewellers": "jewelers",
    "kilogramme": "kilogram",
    "kilogrammes": "kilograms",
    "kilometre": "kilometer",
    "labelling": "labeling",
    "labour": "labor",
    "laboured": "labored",
    "labourer": "laborer",
    "labourers": "laborers",
    "labouring": "laboring",
    "labours": "labors",
    "lacklustre": "lackluster",
    "legalisation": "legalization",
    "legalise": "legalize",
    "legalised": "legalized",
    "legalises": "legalizes",
    "legalising": "legalizing",
    "legitimise": "legitimize",
    "legitimised": "legitimized",
    "legitimises": "legitimizes",
    "legitimising": "legitimizing",
    "leukaemia": "leukemia",
    "levelled": "leveled",
    "leveller": "leveler",
    "levellers": "levelers",
    "levelling": "leveling",
    "libelled": "libeled",
    "libelling": "libeling",
    "libellous": "libelous",
    "liberalisation": "liberalization",
    "liberalise": "liberalize",
    "liberalised": "liberalized",
    "liberalises": "liberalizes",
    "liberalising": "liberalizing",
    "licence": "license",
    "licenced": "licensed",
    "licences": "licenses",
    "licencing": "licensing",
    "lionisation": "lionization",
    "lionise": "lionize",
    "lionised": "lionized",
    "lionises": "lionizes",
    "lionising": "lionizing",
    "liquidise": "liquidize",
    "liquidised": "liquidized",
    "liquidiser": "liquidizer",
    "liquidisers": "liquidizers",
    "liquidises": "liquidizes",
    "liquidising": "liquidizing",
    "litre": "liter",
    "litres": "liters",
    "localise": "localize",
    "localised": "localized",
    "localises": "localizes",
    "localising": "localizing",
    "louvred": "louvered",
    "louvres": "louvers",
    "lustre": "luster",
    "magnetise": "magnetize",
    "magnetised": "magnetized",
    "magnetises": "magnetizes",
    "magnetising": "magnetizing",
    "manoeuvrability": "maneuverability",
    "manoeuvrable": "maneuverable",
    "manoeuvre": "maneuver",
    "manoeuvred": "maneuvered",
    "manoeuvres": "maneuvers",
    "manoeuvring": "maneuvering",
    "manoeuvrings": "maneuverings",
    "marginalisation": "marginalization",
    "marginalise": "marginalize",
    "marginalised": "marginalized",
    "marginalises": "marginalizes",
    "marginalising": "marginalizing",
    "marshalled": "marshaled",
    "marshalling": "marshaling",
    "marvelled": "marveled",
    "marvelling": "marveling",
    "marvellous": "marvelous",
    "marvellously": "marvelously",
    "materialisation": "materialization",
    "materialise": "materialize",
    "materialised": "materialized",
    "materialises": "materializes",
    "materialising": "materializing",
    "maximisation": "maximization",
    "maximise": "maximize",
    "maximised": "maximized",
    "maximises": "maximizes",
    "maximising": "maximizing",
    "meagre": "meager",
    "mechanisation": "mechanization",
    "mechanise": "mechanize",
    "mechanised": "mechanized",
    "mechanises": "mechanizes",
    "mechanising": "mechanizing",
    "mediaeval": "medieval",
    "memorialise": "memorialize",
    "memorialised": "memorialized",
    "memorialises": "memorializes",
    "memorialising": "memorializing",
    "memorise": "memorize",
    "memorised": "memorized",
    "memorises": "memorizes",
    "memorising": "memorizing",
    "mesmerise": "mesmerize",
    "mesmerised": "mesmerized",
    "mesmerises": "mesmerizes",
    "mesmerising": "mesmerizing",
    "metabolise": "metabolize",
    "metabolised": "metabolized",
    "metabolises": "metabolizes",
    "metabolising": "metabolizing",
    "metre": "meter",
    "micrometre": "micrometer",
    "micrometres": "micrometers",
    "militarise": "militarize",
    "militarised": "militarized",
    "militarises": "militarizes",
    "militarising": "militarizing",
    "milligramme": "milligram",
    "milligrammes": "milligrams",
    "millilitre": "milliliter",
    "millilitres": "milliliters",
    "millimetre": "millimeter",
    "millimetres": "millimeters",
    "miniaturisation": "miniaturization",
    "miniaturise": "miniaturize",
    "miniaturised": "miniaturized",
    "miniaturises": "miniaturizes",
    "miniaturising": "miniaturizing",
    "minibuses": "minibusses",
    "minimise": "minimize",
    "minimised": "minimized",
    "minimises": "minimizes",
    "minimising": "minimizing",
    "misbehaviour": "misbehavior",
    "misdemeanour": "misdemeanor",
    "misdemeanours": "misdemeanors",
    "mitre": "miter",
    "mitres": "miters",
    "mobilisation": "mobilization",
    "mobilise": "mobilize",
    "mobilised": "mobilized",
    "mobilises": "mobilizes",
    "mobilising": "mobilizing",
    "modelled": "modeled",
    "modeller": "modeler",
    "modellers": "modelers",
    "modelling": "modeling",
    "modernise": "modernize",
    "modernised": "modernized",
    "modernises": "modernizes",
    "modernising": "modernizing",
    "moisturise": "moisturize",
    "moisturised": "moisturized",
    "moisturiser": "moisturizer",
    "moisturisers": "moisturizers",
    "moisturises": "moisturizes",
    "moisturising": "moisturizing",
    "monologue": "monolog",
    "monologues": "monologs",
    "monopolisation": "monopolization",
    "monopolise": "monopolize",
    "monopolised": "monopolized",
    "monopolises": "monopolizes",
    "monopolising": "monopolizing",
    "moralise": "moralize",
    "moralised": "moralized",
    "moralises": "moralizes",
    "moralising": "moralizing",
    "motorised": "motorized",
    "mould": "mold",
    "moulded": "molded",
    "moulder": "molder",
    "mouldered": "moldered",
    "mouldering": "moldering",
    "moulders": "molders",
    "mouldier": "moldier",
    "mouldiest": "moldiest",
    "moulding": "molding",
    "mouldings": "moldings",
    "moulds": "molds",
    "mouldy": "moldy",
    "moult": "molt",
    "moulted": "molted",
    "moulting": "molting",
    "moults": "molts",
    "moustache": "mustache",
    "moustached": "mustached",
    "moustaches": "mustaches",
    "moustachioed": "mustachioed",
    "multicoloured": "multicolored",
    "nationalisation": "nationalization",
    "nationalisations": "nationalizations",
    "nationalise": "nationalize",
    "nationalised": "nationalized",
    "nationalises": "nationalizes",
    "nationalising": "nationalizing",
    "naturalisation": "naturalization",
    "naturalise": "naturalize",
    "naturalised": "naturalized",
    "naturalises": "naturalizes",
    "naturalising": "naturalizing",
    "neighbour": "neighbor",
    "neighbourhood": "neighborhood",
    "neighbourhoods": "neighborhoods",
    "neighbourliness": "neighborliness",
    "neighbourly": "neighborly",
    "neighbours": "neighbors",
    "neutralisation": "neutralization",
    "neutralise": "neutralize",
    "neutralised": "neutralized",
    "neutralises": "neutralizes",
    "neutralising": "neutralizing",
    "normalisation": "normalization",
    "normalise": "normalize",
    "normalised": "normalized",
    "normalises": "normalizes",
    "normalising": "normalizing",
    "odour": "odor",
    "odourless": "odorless",
    "odours": "odors",
    "oesophagus": "esophagus",
    "oesophaguses": "esophaguses",
    "oestrogen": "estrogen",
    "offence": "offense",
    "offences": "offenses",
    "optimise": "optimize",
    "optimised": "optimized",
    "optimises": "optimizes",
    "optimising": "optimizing",
    "organisation": "organization",
    "organisational": "organizational",
    "organisations": "organizations",
    "organised": "organized",
    "organiser": "organizer",
    "organisers": "organizers",
    "organises": "organizes",
    "organising": "organizing",
    "orthopaedic": "orthopedic",
    "orthopaedics": "orthopedics",
    "ostracise": "ostracize",
    "ostracised": "ostracized",
    "ostracises": "ostracizes",
    "ostracising": "ostracizing",
    "outmanoeuvre": "outmaneuver",
    "outmanoeuvred": "outmaneuvered",
    "outmanoeuvres": "outmaneuvers",
    "outmanoeuvring": "outmaneuvering",
    "overemphasise": "overemphasize",
    "overemphasised": "overemphasized",
    "overemphasises": "overemphasizes",
    "overemphasising": "overemphasizing",
    "oxidisation": "oxidization",
    "oxidise": "oxidize",
    "oxidised": "oxidized",
    "oxidises": "oxidizes",
    "oxidising": "oxidizing",
    "paederast": "pederast",
    "paederasts": "pederasts",
    "paediatric": "pediatric",
    "paediatrician": "pediatrician",
    "paediatricians": "pediatricians",
    "paediatrics": "pediatrics",
    "paedophile": "pedophile",
    "paedophiles": "pedophiles",
    "paedophilia": "pedophilia",
    "palaeolithic": "paleolithic",
    "palaeontologist": "paleontologist",
    "palaeontologists": "paleontologists",
    "palaeontology": "paleontology",
    "panelled": "paneled",
    "panelling": "paneling",
    "panellist": "panelist",
    "panellists": "panelists",
    "paralyse": "paralyze",
    "paralysed": "paralyzed",
    "paralyses": "paralyzes",
    "paralysing": "paralyzing",
    "parcelled": "parceled",
    "parcelling": "parceling",
    "parlour": "parlor",
    "parlours": "parlors",
    "particularise": "particularize",
    "particularised": "particularized",
    "particularises": "particularizes",
    "particularising": "particularizing",
    "passivisation": "passivization",
    "passivise": "passivize",
    "passivised": "passivized",
    "passivises": "passivizes",
    "passivising": "passivizing",
    "pasteurisation": "pasteurization",
    "pasteurise": "pasteurize",
    "pasteurised": "pasteurized",
    "pasteurises": "pasteurizes",
    "pasteurising": "pasteurizing",
    "patronise": "patronize",
    "patronised": "patronized",
    "patronises": "patronizes",
    "patronising": "patronizing",
    "patronisingly": "patronizingly",
    "pedalled": "pedaled",
    "pedalling": "pedaling",
    "pedestrianisation": "pedestrianization",
    "pedestrianise": "pedestrianize",
    "pedestrianised": "pedestrianized",
    "pedestrianises": "pedestrianizes",
    "pedestrianising": "pedestrianizing",
    "penalise": "penalize",
    "penalised": "penalized",
    "penalises": "penalizes",
    "penalising": "penalizing",
    "pencilled": "penciled",
    "pencilling": "penciling",
    "personalise": "personalize",
    "personalised": "personalized",
    "personalises": "personalizes",
    "personalising": "personalizing",
    "pharmacopoeia": "pharmacopeia",
    "pharmacopoeias": "pharmacopeias",
    "philosophise": "philosophize",
    "philosophised": "philosophized",
    "philosophises": "philosophizes",
    "philosophising": "philosophizing",
    "philtre": "filter",
    "philtres": "filters",
    "plagiarise": "plagiarize",
    "plagiarised": "plagiarized",
    "plagiarises": "plagiarizes",
    "plagiarising": "plagiarizing",
    "plough": "plow",
    "ploughed": "plowed",
    "ploughing": "plowing",
    "ploughman": "plowman",
    "ploughmen": "plowmen",
    "ploughs": "plows",
    "ploughshare": "plowshare",
    "ploughshares": "plowshares",
    "polarisation": "polarization",
    "polarise": "polarize",
    "polarised": "polarized",
    "polarises": "polarizes",
    "polarising": "polarizing",
    "politicisation": "politicization",
    "politicise": "politicize",
    "politicised": "politicized",
    "politicises": "politicizes",
    "politicising": "politicizing",
    "popularisation": "popularization",
    "popularise": "popularize",
    "popularised": "popularized",
    "popularises": "popularizes",
    "popularising": "popularizing",
    "pouffe": "pouf",
    "pouffes": "poufs",
    "practise": "practice",
    "practised": "practiced",
    "practises": "practices",
    "practising": "practicing",
    "praesidium": "presidium",
    "praesidiums": "presidiums",
    "pressurisation": "pressurization",
    "pressurise": "pressurize",
    "pressurised": "pressurized",
    "pressurises": "pressurizes",
    "pressurising": "pressurizing",
    "pretence": "pretense",
    "pretences": "pretenses",
    "primaeval": "primeval",
    "prioritisation": "prioritization",
    "prioritise": "prioritize",
    "prioritised": "prioritized",
    "prioritises": "prioritizes",
    "prioritising": "prioritizing",
    "privatisation": "privatization",
    "privatisations": "privatizations",
    "privatise": "privatize",
    "privatised": "privatized",
    "privatises": "privatizes",
    "privatising": "privatizing",
    "professionalisation": "professionalization",
    "professionalise": "professionalize",
    "professionalised": "professionalized",
    "professionalises": "professionalizes",
    "professionalising": "professionalizing",
    "programmes": "programs",
    "prologue": "prolog",
    "prologues": "prologs",
    "propagandise": "propagandize",
    "propagandised": "propagandized",
    "propagandises": "propagandizes",
    "propagandising": "propagandizing",
    "proselytise": "proselytize",
    "proselytised": "proselytized",
    "proselytiser": "proselytizer",
    "proselytisers": "proselytizers",
    "proselytises": "proselytizes",
    "proselytising": "proselytizing",
    "psychoanalyse": "psychoanalyze",
    "psychoanalysed": "psychoanalyzed",
    "psychoanalyses": "psychoanalyzes",
    "psychoanalysing": "psychoanalyzing",
    "publicise": "publicize",
    "publicised": "publicized",
    "publicises": "publicizes",
    "publicising": "publicizing",
    "pulverisation": "pulverization",
    "pulverise": "pulverize",
    "pulverised": "pulverized",
    "pulverises": "pulverizes",
    "pulverising": "pulverizing",
    "pummelled": "pummel",
    "pummelling": "pummeled",
    "pyjama": "pajama",
    "pyjamas": "pajamas",
    "pzazz": "pizzazz",
    "quarrelled": "quarreled",
    "quarrelling": "quarreling",
    "radicalise": "radicalize",
    "radicalised": "radicalized",
    "radicalises": "radicalizes",
    "radicalising": "radicalizing",
    "rancour": "rancor",
    "randomise": "randomize",
    "randomised": "randomized",
    "randomises": "randomizes",
    "randomising": "randomizing",
    "rationalisation": "rationalization",
    "rationalisations": "rationalizations",
    "rationalise": "rationalize",
    "rationalised": "rationalized",
    "rationalises": "rationalizes",
    "rationalising": "rationalizing",
    "ravelled": "raveled",
    "ravelling": "raveling",
    "realisable": "realizable",
    "realisation": "realization",
    "realisations": "realizations",
    "realise": "realize",
    "realised": "realized",
    "realises": "realizes",
    "realising": "realizing",
    "recognisable": "recognizable",
    "recognisably": "recognizably",
    "recognisance": "recognizance",
    "recognise": "recognize",
    "recognised": "recognized",
    "recognises": "recognizes",
    "recognising": "recognizing",
    "reconnoitre": "reconnoiter",
    "reconnoitred": "reconnoitered",
    "reconnoitres": "reconnoiters",
    "reconnoitring": "reconnoitering",
    "refuelled": "refueled",
    "refuelling": "refueling",
    "regularisation": "regularization",
    "regularise": "regularize",
    "regularised": "regularized",
    "regularises": "regularizes",
    "regularising": "regularizing",
    "remodelled": "remodeled",
    "remodelling": "remodeling",
    "remould": "remold",
    "remoulded": "remolded",
    "remoulding": "remolding",
    "remoulds": "remolds",
    "reorganisation": "reorganization",
    "reorganisations": "reorganizations",
    "reorganise": "reorganize",
    "reorganised": "reorganized",
    "reorganises": "reorganizes",
    "reorganising": "reorganizing",
    "revelled": "reveled",
    "reveller": "reveler",
    "revellers": "revelers",
    "revelling": "reveling",
    "revitalise": "revitalize",
    "revitalised": "revitalized",
    "revitalises": "revitalizes",
    "revitalising": "revitalizing",
    "revolutionise": "revolutionize",
    "revolutionised": "revolutionized",
    "revolutionises": "revolutionizes",
    "revolutionising": "revolutionizing",
    "rhapsodise": "rhapsodize",
    "rhapsodised": "rhapsodized",
    "rhapsodises": "rhapsodizes",
    "rhapsodising": "rhapsodizing",
    "rigour": "rigor",
    "rigours": "rigors",
    "ritualised": "ritualized",
    "rivalled": "rivaled",
    "rivalling": "rivaling",
    "romanticise": "romanticize",
    "romanticised": "romanticized",
    "romanticises": "romanticizes",
    "romanticising": "romanticizing",
    "rumour": "rumor",
    "rumoured": "rumored",
    "rumours": "rumors",
    "sabre": "saber",
    "sabres": "sabers",
    "saltpetre": "saltpeter",
    "sanitise": "sanitize",
    "sanitised": "sanitized",
    "sanitises": "sanitizes",
    "sanitising": "sanitizing",
    "satirise": "satirize",
    "satirised": "satirized",
    "satirises": "satirizes",
    "satirising": "satirizing",
    "saviour": "savior",
    "saviours": "saviors",
    "savour": "savor",
    "savoured": "savored",
    "savouries": "savories",
    "savouring": "savoring",
    "savours": "savors",
    "savoury": "savory",
    "scandalise": "scandalize",
    "scandalised": "scandalized",
    "scandalises": "scandalizes",
    "scandalising": "scandalizing",
    "sceptic": "skeptic",
    "sceptical": "skeptical",
    "sceptically": "skeptically",
    "scepticism": "skepticism",
    "sceptics": "skeptics",
    "sceptre": "scepter",
    "sceptres": "scepters",
    "scrutinise": "scrutinize",
    "scrutinised": "scrutinized",
    "scrutinises": "scrutinizes",
    "scrutinising": "scrutinizing",
    "secularisation": "secularization",
    "secularise": "secularize",
    "secularised": "secularized",
    "secularises": "secularizes",
    "secularising": "secularizing",
    "sensationalise": "sensationalize",
    "sensationalised": "sensationalized",
    "sensationalises": "sensationalizes",
    "sensationalising": "sensationalizing",
    "sensitise": "sensitize",
    "sensitised": "sensitized",
    "sensitises": "sensitizes",
    "sensitising": "sensitizing",
    "sentimentalise": "sentimentalize",
    "sentimentalised": "sentimentalized",
    "sentimentalises": "sentimentalizes",
    "sentimentalising": "sentimentalizing",
    "sepulchre": "sepulcher",
    "sepulchres": "sepulchers",
    "serialisation": "serialization",
    "serialisations": "serializations",
    "serialise": "serialize",
    "serialised": "serialized",
    "serialises": "serializes",
    "serialising": "serializing",
    "sermonise": "sermonize",
    "sermonised": "sermonized",
    "sermonises": "sermonizes",
    "sermonising": "sermonizing",
    "shovelled": "shoveled",
    "shovelling": "shoveling",
    "shrivelled": "shriveled",
    "shrivelling": "shriveling",
    "signalise": "signalize",
    "signalised": "signalized",
    "signalises": "signalizes",
    "signalising": "signalizing",
    "signalled": "signaled",
    "signalling": "signaling",
    "smoulder": "smolder",
    "smouldered": "smoldered",
    "smouldering": "smoldering",
    "smoulders": "smolders",
    "snivelled": "sniveled",
    "snivelling": "sniveling",
    "snorkelled": "snorkeled",
    "snowplough": "snowplow",
    "snowploughs": "snowplow",
    "socialisation": "socialization",
    "socialise": "socialize",
    "socialised": "socialized",
    "socialises": "socializes",
    "socialising": "socializing",
    "sodomise": "sodomize",
    "sodomised": "sodomized",
    "sodomises": "sodomizes",
    "sodomising": "sodomizing",
    "solemnise": "solemnize",
    "solemnised": "solemnized",
    "solemnises": "solemnizes",
    "solemnising": "solemnizing",
    "sombre": "somber",
    "specialisation": "specialization",
    "specialisations": "specializations",
    "specialise": "specialize",
    "specialised": "specialized",
    "specialises": "specializes",
    "specialising": "specializing",
    "spectre": "specter",
    "spectres": "specters",
    "spiralled": "spiraled",
    "spiralling": "spiraling",
    "splendour": "splendor",
    "splendours": "splendors",
    "squirrelled": "squirreled",
    "squirrelling": "squirreling",
    "stabilisation": "stabilization",
    "stabilise": "stabilize",
    "stabilised": "stabilized",
    "stabiliser": "stabilizer",
    "stabilisers": "stabilizers",
    "stabilises": "stabilizes",
    "stabilising": "stabilizing",
    "standardisation": "standardization",
    "standardise": "standardize",
    "standardised": "standardized",
    "standardises": "standardizes",
    "standardising": "standardizing",
    "stencilled": "stenciled",
    "stencilling": "stenciling",
    "sterilisation": "sterilization",
    "sterilisations": "sterilizations",
    "sterilise": "sterilize",
    "sterilised": "sterilized",
    "steriliser": "sterilizer",
    "sterilisers": "sterilizers",
    "sterilises": "sterilizes",
    "sterilising": "sterilizing",
    "stigmatisation": "stigmatization",
    "stigmatise": "stigmatize",
    "stigmatised": "stigmatized",
    "stigmatises": "stigmatizes",
    "stigmatising": "stigmatizing",
    "storey": "story",
    "storeys": "stories",
    "subsidisation": "subsidization",
    "subsidise": "subsidize",
    "subsidised": "subsidized",
    "subsidiser": "subsidizer",
    "subsidisers": "subsidizers",
    "subsidises": "subsidizes",
    "subsidising": "subsidizing",
    "succour": "succor",
    "succoured": "succored",
    "succouring": "succoring",
    "succours": "succors",
    "sulphate": "sulfate",
    "sulphates": "sulfates",
    "sulphide": "sulfide",
    "sulphides": "sulfides",
    "sulphur": "sulfur",
    "sulphurous": "sulfurous",
    "summarise": "summarize",
    "summarised": "summarized",
    "summarises": "summarizes",
    "summarising": "summarizing",
    "swivelled": "swiveled",
    "swivelling": "swiveling",
    "symbolise": "symbolize",
    "symbolised": "symbolized",
    "symbolises": "symbolizes",
    "symbolising": "symbolizing",
    "sympathise": "sympathize",
    "sympathised": "sympathized",
    "sympathiser": "sympathizer",
    "sympathisers": "sympathizers",
    "sympathises": "sympathizes",
    "sympathising": "sympathizing",
    "synchronisation": "synchronization",
    "synchronise": "synchronize",
    "synchronised": "synchronized",
    "synchronises": "synchronizes",
    "synchronising": "synchronizing",
    "synthesise": "synthesize",
    "synthesised": "synthesized",
    "synthesiser": "synthesizer",
    "synthesisers": "synthesizers",
    "synthesises": "synthesizes",
    "synthesising": "synthesizing",
    "syphon": "siphon",
    "syphoned": "siphoned",
    "syphoning": "siphoning",
    "syphons": "siphons",
    "systematisation": "systematization",
    "systematise": "systematize",
    "systematised": "systematized",
    "systematises": "systematizes",
    "systematising": "systematizing",
    "tantalise": "tantalize",
    "tantalised": "tantalized",
    "tantalises": "tantalizes",
    "tantalising": "tantalizing",
    "tantalisingly": "tantalizingly",
    "tasselled": "tasseled",
    "technicolour": "technicolor",
    "temporise": "temporize",
    "temporised": "temporized",
    "temporises": "temporizes",
    "temporising": "temporizing",
    "tenderise": "tenderize",
    "tenderised": "tenderized",
    "tenderises": "tenderizes",
    "tenderising": "tenderizing",
    "terrorise": "terrorize",
    "terrorised": "terrorized",
    "terrorises": "terrorizes",
    "terrorising": "terrorizing",
    "theatre": "theater",
    "theatregoer": "theatergoer",
    "theatregoers": "theatergoers",
    "theatres": "theaters",
    "theorise": "theorize",
    "theorised": "theorized",
    "theorises": "theorizes",
    "theorising": "theorizing",
    "tonne": "ton",
    "tonnes": "tons",
    "towelled": "toweled",
    "towelling": "toweling",
    "toxaemia": "toxemia",
    "tranquillise": "tranquilize",
    "tranquillised": "tranquilized",
    "tranquilliser": "tranquilizer",
    "tranquillisers": "tranquilizers",
    "tranquillises": "tranquilizes",
    "tranquillising": "tranquilizing",
    "tranquillity": "tranquility",
    "tranquillize": "tranquilize",
    "tranquillized": "tranquilized",
    "tranquillizer": "tranquilizer",
    "tranquillizers": "tranquilizers",
    "tranquillizes": "tranquilizes",
    "tranquillizing": "tranquilizing",
    "tranquilly": "tranquility",
    "transistorised": "transistorized",
    "traumatise": "traumatize",
    "traumatised": "traumatized",
    "traumatises": "traumatizes",
    "traumatising": "traumatizing",
    "travelled": "traveled",
    "traveller": "traveler",
    "travellers": "travelers",
    "travelogue": "travelog",
    "travelogues": "travelogs",
    "trialled": "trialed",
    "trialling": "trialing",
    "tricolour": "tricolor",
    "tricolours": "tricolors",
    "trivialise": "trivialize",
    "trivialised": "trivialized",
    "trivialises": "trivializes",
    "trivialising": "trivializing",
    "tumour": "tumor",
    "tumours": "tumors",
    "tunnelled": "tunneled",
    "tunnelling": "tunneling",
    "tyrannise": "tyrannize",
    "tyrannised": "tyrannized",
    "tyrannises": "tyrannizes",
    "tyrannising": "tyrannizing",
    "tyre": "tire",
    "tyres": "tires",
    "unauthorised": "unauthorized",
    "uncivilised": "uncivilized",
    "underutilised": "underutilized",
    "unequalled": "unequaled",
    "unfavourable": "unfavorable",
    "unfavourably": "unfavorably",
    "unionisation": "unionization",
    "unionise": "unionize",
    "unionised": "unionized",
    "unionises": "unionizes",
    "unionising": "unionizing",
    "unorganised": "unorganized",
    "unravelled": "unraveled",
    "unravelling": "unraveling",
    "unrecognisable": "unrecognizable",
    "unrecognised": "unrecognized",
    "unrivalled": "unrivaled",
    "unsavoury": "unsavory",
    "untrammelled": "untrammeled",
    "urbanisation": "urbanization",
    "urbanise": "urbanize",
    "urbanised": "urbanized",
    "urbanises": "urbanizes",
    "urbanising": "urbanizing",
    "utilisable": "utilizable",
    "utilisation": "utilization",
    "utilise": "utilize",
    "utilised": "utilized",
    "utilises": "utilizes",
    "utilising": "utilizing",
    "valour": "valor",
    "vandalise": "vandalize",
    "vandalised": "vandalized",
    "vandalises": "vandalizes",
    "vandalising": "vandalizing",
    "vaporisation": "vaporization",
    "vaporise": "vaporize",
    "vaporised": "vaporized",
    "vaporises": "vaporizes",
    "vaporising": "vaporizing",
    "vapour": "vapor",
    "vapours": "vapors",
    "verbalise": "verbalize",
    "verbalised": "verbalized",
    "verbalises": "verbalizes",
    "verbalising": "verbalizing",
    "victimisation": "victimization",
    "victimise": "victimize",
    "victimised": "victimized",
    "victimises": "victimizes",
    "victimising": "victimizing",
    "videodisc": "videodisk",
    "videodiscs": "videodisks",
    "vigour": "vigor",
    "visualisations": "visualizations",
    "visualise": "visualize",
    "visualised": "visualized",
    "visualises": "visualizes",
    "visualising": "visualizing",
    "vocalisation": "vocalization",
    "vocalisations": "vocalizations",
    "vocalise": "vocalize",
    "vocalised": "vocalized",
    "vocalises": "vocalizes",
    "vocalising": "vocalizing",
    "vulcanised": "vulcanized",
    "vulgarisation": "vulgarization",
    "vulgarise": "vulgarize",
    "vulgarised": "vulgarized",
    "vulgarises": "vulgarizes",
    "vulgarising": "vulgarizing",
    "waggon": "wagon",
    "waggons": "wagons",
    "watercolour": "watercolor",
    "watercolours": "watercolors",
    "weaselled": "weaseled",
    "weaselling": "weaseling",
    "westernisation": "westernization",
    "westernise": "westernize",
    "westernised": "westernized",
    "westernises": "westernizes",
    "westernising": "westernizing",
    "womanise": "womanize",
    "womanised": "womanized",
    "womaniser": "womanizer",
    "womanisers": "womanizers",
    "womanises": "womanizes",
    "womanising": "womanizing",
    "woollen": "woolen",
    "woollens": "woolens",
    "woollies": "woolies",
    "woolly": "wooly",
    "yodelled": "yodeled",
    "yodelling": "yodeling",
    "yoghourt": "yogurt",
    "yoghourts": "yogurts",
    "yoghurt": "yogurt",
    "yoghurts": "yogurts"
};

normalizer._init();

module.exports = normalizer;
},{"./numberParser":43}],43:[function(require,module,exports){
var numberParser = {};

numberParser.parse = function (numbersInString) {
    numbersInString = numbersInString.toLowerCase().replace("-", " ");
    var ref = {
            a: 1,
            one: 1,
            two: 2,
            three: 3,
            four: 4,
            five: 5,
            six: 6,
            seven: 7,
            eight: 8,
            nine: 9,
            ten: 10,
            eleven: 11,
            twelve: 12,
            thirteen: 13,
            fourteen: 14,
            fifteen: 15,
            sixteen: 16,
            seventeen: 17,
            eighteen: 18,
            nineteen: 19,
            twenty: 20,
            thirty: 30,
            forty: 40,
            fifty: 50,
            sixty: 60,
            seventy: 70,
            eighty: 80,
            ninety: 90
        },
        mult = {hundred: 100, thousand: 1000, million: 1000000, billion: 1000000000, trillion: 1000000000000},
        strNums = numbersInString.split(' ').reverse(),
        number = 0,
        multiplier = 1;

    var i;
    for (i in strNums) {
        if (strNums.hasOwnProperty(i)) {
            if (mult[strNums[i]] !== undefined) {
                if (mult[strNums[i]] === 100) {
                    multiplier *= mult[strNums[i]];
                } else {
                    multiplier = mult[strNums[i]];
                }
            } else {
                if (!isNaN(parseFloat(strNums[i]))) {
                    number += parseFloat(strNums[i]) * multiplier;
                } else {
                    var nums = strNums[i].split('-');
                    number += ((ref[nums[0]] || 0) + (ref[nums[1]] || 0)) * multiplier;
                }
            }
        }
    }
    return number;
};

module.exports = numberParser;
},{}],44:[function(require,module,exports){
var axios = require('axios');

var intentService = require("./intentService");
var memory = require("./memory");
var nlp = require("./nlp/nlp");
var utils = require("./utils");

var pluginService = {
    plugins: [],
    namespaces: []
};

var Plugin = function (plugin) {
    this.registrationFunction = plugin.register;
    this.description = plugin.description || "";

    this.namespace = plugin.namespace;
    this.examples = plugin.examples || [];

    this.enabled = false;

    this.intentMatchers = [];
    this.triggers = {};
    this.options = null;
};

Plugin.prototype.register = function () {
    var config = utils.extend({}, memory.getPluginSettings(this.namespace) || {});

    var service = this.registrationFunction(config, nlp, axios);

    this.intentMatchers = [];
    this.triggers = {};

    var i;

    if (service.hasOwnProperty("triggers")) {
        var trigger;
        for (trigger in service.triggers) {
            if (service.triggers.hasOwnProperty(trigger) && typeof service.triggers[trigger] === "function") {
                this.triggers[this.namespace + "." + trigger] = {
                    method: service.triggers[trigger],
                    namespace: this.namespace
                };
            }
        }
    }
    if (service.hasOwnProperty("intent")) {
        var intent;
        for (i = 0; i < service.intent.length; i++) {
            intent = service.intent[i];
            if (intent.value && intent.trigger && this.triggers.hasOwnProperty(intent.trigger)) {
                this.intentMatchers.push(new intentService.Matcher(intent.value, intent.trigger, intent.expectations));
            }
        }
    }
    if (service.hasOwnProperty("options")) {
        this.options = service.options;
    }
};

pluginService.register = function (plugin) {
    plugin = new Plugin(plugin);

    this.plugins.push(plugin);
    this.namespaces.push(plugin.namespace);

    if (memory.isEnabledPlugin(plugin.namespace)) {
        this.enablePlugin(plugin);
        console.log('Plugin Loader: Plugin enabled: "' + plugin.namespace + '"');
    } else {
        this.disablePlugin(plugin);
        console.log('Plugin Loader: Plugin loaded: "' + plugin.namespace + '"');
    }

    return plugin;
};

pluginService.getPlugins = function () {
    return this.plugins || [];
};

pluginService.getEnabledPlugins = function () {
    var plugins = this.getPlugins();

    return plugins.filter(function (plugin) {
        return plugin.enabled;
    });
};

pluginService.getPlugin = function (namespace) {
    var plugin = null;

    var plugins = this.getPlugins();
    var i;
    for (i = 0; i < plugins.length; i++) {
        if (plugins[i].namespace === namespace) {
            plugin = plugins[i];
            break;
        }
    }

    return plugin;
};

pluginService.updatePlugin = function (pluginNamespace, updateTemplate, session) {
    var plugin = this.getPlugin(pluginNamespace);

    if (updateTemplate && plugin) {

        if (!plugin.enabled && updateTemplate.enabled) {
            this.enablePlugin(plugin);
        } else if (plugin.enabled && !updateTemplate.enabled) {
            this.disablePlugin(plugin);
        }

        if (updateTemplate.hasOwnProperty('options') && session) {
            var option;
            for (option in updateTemplate.options) {
                if (updateTemplate.options.hasOwnProperty(option) && plugin.options.hasOwnProperty(option)) {
                    plugin.options[option].value = updateTemplate.options[option].value;
                    session.setMemory(plugin.namespace + "." + option, plugin.options[option].value);
                }
            }
        }
    }

    return plugin;
};

pluginService.enablePlugin = function (plugin) {
    plugin.register();
    plugin.enabled = true;
    memory.setEnabledPlugin(plugin.namespace, true);
};

pluginService.disablePlugin = function (plugin) {
    plugin.enabled = false;
    memory.setEnabledPlugin(plugin.namespace, false);
};

pluginService.sanitizePlugins = function (input, session) {
    if (!input) {
        return input;
    }

    if (input instanceof Array) {
        var plugins = [];

        var i;
        for (i = 0; i < input.length; i++) {
            plugins.push(this.sanitizePlugins(input[i]));
        }

        return plugins;
    }

    var plugin = input;

    var triggers = [];

    var trigger;
    for (trigger in plugin.triggers) {
        if (plugin.triggers.hasOwnProperty(trigger)) {
            triggers.push(trigger);
        }
    }

    var options = null;

    if (session) {
        var memories = memory.get(session.username);
        var option;
        var name;
        for (option in plugin.options) {
            if (plugin.options.hasOwnProperty(option)) {
                name = plugin.namespace + "." + option;
                options = options || {};
                options[option] = utils.extend({}, plugin.options[option]);
                if (memories[name]) {
                    options[option].value = memories[name];
                }
            }
        }
    }

    return {
        name: plugin.name,
        description: plugin.description,
        namespace: plugin.namespace,
        options: options,
        enabled: plugin.enabled,
        triggers: triggers,
        examples: plugin.examples
    };
};

module.exports = pluginService;
},{"./intentService":33,"./memory":35,"./nlp/nlp":41,"./utils":50,"axios":2}],45:[function(require,module,exports){
var Response = function (value, expectations, weight) {
    this.value = "";
    this.expectations = [];
    this.weight = 1;

    if (typeof value === "object" && value.hasOwnProperty("value")) {
        var response = value;
        this.value = response.value;
        this.expectations = response.expectations || [];
        this.weight = response.weight || 1;
    } else {
        this.value = value || "";
        this.expectations = expectations || [];
        this.weight = weight || 1;
    }
};

module.exports = Response;
},{}],46:[function(require,module,exports){
var nlp = require("./nlp/nlp");
var Response = require("./response");

var responseService = {};

responseService.getResponses = function (template) {
    var responses = [];

    if (template instanceof Array) {
        var i;
        for (i = 0; i < template.length; i++) {
            responses = responses.concat(this.getResponses(template[i]));
        }
    } else {
        var builder = new responseService.Builder(template);
        responses = builder.getResponses();
    }

    return responses;
};

responseService.getBestResponse = function (responses) {
    console.log("Choosing 1 of " + responses.length + " responses.");

    // First shuffle the array so that any items with the same weight will appear with the same frequency
    responses = nlp.shuffle(responses.slice(0));

    // Get the sum of the weights
    var sumOfWeights = responses.reduce(function(memo, response) {
        return memo + response.weight;
    }, 0);

    // Get a random weighted response
    var getRandom = function (sumOfWeights) {
        var random = Math.floor(Math.random() * (sumOfWeights + 1));

        return function (response) {
            random -= response.weight;
            return random <= 0;
        };
    };

    return responses.find(getRandom(sumOfWeights));
};

responseService.getUnknownResponse = function (inputExpression) {
    var template = "[I'm sorry,] ((I'm not sure I|I don't) understand [what (you mean [by '" + inputExpression.value + "']|you're saying [when you say, '" + inputExpression.value + "'])]|I didn't quite get that).";
    var responses = this.getResponses(template);

    var res = [];
    var i;
    for (i = 0; i < responses.length; i++) {
        res.push(new Response(responses[i]));
    }

    return this.getBestResponse(res);
};

responseService.Builder = function (template) {
    var string = (typeof template === "string") ? template : template.value || "";
    this.expectations = (typeof template === "string") ? [] : template.expectations || [];
    this.weight = (typeof template === "string") ? "" : template.weight || 0;
    this.tokens = responseService.Builder.lex(string);
    this.tree = responseService.Builder.buildParseTree(this.tokens);
    this.getInputsFunction = responseService.Builder.parseGetInputs(this.tree);
};

responseService.Builder.prototype.getResponses = function () {
    var responses = [];
    var inputs = [];
    this.getInputsFunction(inputs);

    var i;
    var input;
    for (i = 0; i < inputs.length; i++) {
        input = inputs[i].join(" ").replace(/\s+([.,!:?;])/g, "$1");
        responses.push(new Response(input, this.expectations, this.weight));
    }

    return responses;
};

responseService.Builder.parseGetInputs = function (tree) {
    var getInputsFunction;
    var getInputsFunctions;

    var i;
    switch (tree.op) {
    case "start":
        getInputsFunctions = [];
        for (i = 0; i < tree.values.length; i++) {
            getInputsFunctions.push(responseService.Builder.parseGetInputs(tree.values[i]));
        }

        getInputsFunction = function (inputs) {
            var i;

            if (inputs.length === 0) {
                inputs.push([]);
            }

            // Append each piece of text onto each input
            for (i = 0; i < this.length; i++) {
                this[i](inputs);
            }

        }.bind(getInputsFunctions);
        break;
    case "[":
        getInputsFunctions = [];
        for (i = 0; i < tree.values.length; i++) {
            getInputsFunctions.push(responseService.Builder.parseGetInputs(tree.values[i]));
        }

        getInputsFunction = function (inputs) {
            var i;
            var a;

            // Keep the original set of inputs without the optional tree values and create a duplicate set of inputs that does have the tree values.
            // Merge the two together.
            var alternateInputs = responseService.Builder.deepClone(inputs);
            for (i = 0; i < this.length; i++) {
                this[i](alternateInputs);
            }

            for (a = 0; a < alternateInputs.length; a++) {
                inputs.push(alternateInputs[a]);
            }

        }.bind(getInputsFunctions);
        break;
    case "(":
        var getInputsFunctionGroups = [];
        var innerArray = null;
        for (i = 0; i < tree.values.length; i++) {
            if (tree.values[i].op === "|") {
                innerArray = null;
            } else {
                if (innerArray === null) {
                    innerArray = [];
                    getInputsFunctionGroups.push(innerArray);
                }

                innerArray.push(responseService.Builder.parseGetInputs(tree.values[i]));
            }
        }

        getInputsFunction = function (inputs) {
            var i;
            var g;
            var a;
            var alternatesToAdd = [];
            var alternateInputs;

            // For each alternate, create a duplicate set of inputs that contain the alternate tree
            for (g = 1; g < this.length; g++) {
                alternateInputs = responseService.Builder.deepClone(inputs);
                alternatesToAdd.push(alternateInputs);

                for (i = 0; i < this[g].length; i++) {
                    this[g][i](alternateInputs);
                }
            }

            // for the first function, add onto the original set
            for (i = 0; i < this[0].length; i++) {
                this[0][i](inputs);
            }

            // Merge the sets together
            for (a = 0; a < alternatesToAdd.length; a++) {
                for (i = 0; i < alternatesToAdd[a].length; i++) {
                    inputs.push(alternatesToAdd[a][i]);
                }
            }

        }.bind(getInputsFunctionGroups);
        break;
    case "text":
        getInputsFunction = function (inputs) {
            var i;
            var a;

            // Append each piece of text onto each input
            for (a = 0; a < inputs.length; a++) {
                for (i = 0; i < this.length; i++) {
                    inputs[a].push(this[i]);
                }
            }

        }.bind(tree.values);
        break;
    }

    return getInputsFunction;
};

responseService.Builder.lex = function (input) {
    var tokens = [];

    var i;
    var text = "";
    for (i = 0; i < input.length; i++) {

        switch (input[i]) {
        case "[":
        case "]":
        case "(":
        case ")":
        case "|":
            if (text.length > 0) {
                if (text.trim().length > 0) {
                    tokens.push({type: "text", value: text.trim()});
                }
                text = "";
            }
            tokens.push({ type: "op", value: input[i] });
            break;
        default:
            text += input[i];
        }
    }

    if (text.length > 0) {
        if (text.trim().length > 0) {
            tokens.push({type: "text", value: text.trim()});
        }
        text = "";
    }

    return tokens;
};

responseService.Builder.buildParseTree = function (tokens, op) {
    var tree = {
        op: op || "start",
        values: []
    };

    var token;
    var stopLoop = false;

    while (tokens.length > 0) {
        token = tokens.shift();

        if (token.type === "op") {

            switch (token.value) {
            case "[":
            case "(":
                tree.values.push(responseService.Builder.buildParseTree(tokens, token.value));
                break;
            case "|":
                tree.values.push({op: "|", values: []});
                break;
            case "]":
            case ")":
                stopLoop = true;
                break;
            default:
                tree.values.push({
                    op: "text",
                    values: token.value.split(" ")
                });
            }

        } else {
            tree.values.push({
                op: "text",
                values: token.value.split(" ")
            });
        }

        if (stopLoop) {
            break;
        }
    }

    return tree;
};

responseService.Builder.deepClone = function (array) {
    return JSON.parse(JSON.stringify(array));
};

module.exports = responseService;
},{"./nlp/nlp":41,"./response":45}],47:[function(require,module,exports){
var Q = require("Q");

var Expression = require("./expression");
var intentService = require("./intentService");
var memory = require("./memory");
var pluginService = require("./pluginService");
var responseService = require("./responseService");
var Timer = require("./timer");
var utils = require("./utils");

var Session = function () {
    this.username = null;
    this.memory = {};

    this.responseHandlers = [];
    this.userConfig = null;
    this.session = null;

    // Keep track of the transcript. This should allow for repetition checking for both the user and the AI. This should
    // help prevent the AI from repeating a response to frequently. Also, when the user repeats the same thing multiple
    // times, the AI can respond differently.
    this._transcript = [];

    this._expectations = [];

    this.timers = [];
};

Session.prototype.sendCommand = function (message) {
    var self = this;

    var sendResponse = function (session, data) {
        var i;
        for (i = 0; i < session.responseHandlers.length; i++) {
            session.responseHandlers[i](data);
        }
    };

    this.processExpression(message).then(function (result) {
        if (result) {
            sendResponse(self, result);
        }
    }, function (e) {
        console.error("API: unexpected error: " + e);
    }, function (intermediateResponse) {
        if (intermediateResponse) {
            sendResponse(self, intermediateResponse);
        }
    });
};

Session.prototype.onResponse = function (handler) {
    if (this.responseHandlers.indexOf(handler) >= 0) {
        return;
    }
    this.responseHandlers.push(handler);

    var self = this;
    return function () {
        var idx = self.responseHandlers.indexOf(handler);
        if (idx >= 0) {
            self.responseHandlers.splice(idx, 1);
        }
    };
};

Session.prototype.loadUserConfig = function (config) {
    this.memory = utils.extend(config, this.memory);

    // If the session is linked to an account, store the memory in long term
    if (this.username) {
        memory.set(this.username, this.memory);
    }
};

Session.prototype.link = function (username) {
    if (username && username !== this.username) {
        this.username = username;
        var loadedMemory = memory.get(username);
        this.memory = utils.extend(loadedMemory, this.memory);
        memory.set(username, this.memory);
    }
};

Session.prototype.unlink = function () {
    this.username = null;
};

Session.prototype.getMemory = function (name) {
    return memory.getShortTerm(this.memory, name);
};

Session.prototype.setMemory = function (name, value) {
    memory.setShortTerm(this.memory, name, value);

    // If the session is linked to an account, store the memory in long term
    if (this.username) {
        memory.set(this.username, this.memory);
    }
};

Session.prototype.getPlugins = function () {
    var plugins = pluginService.getPlugins();
    return pluginService.sanitizePlugins(plugins, this);
};

Session.prototype.getPlugin = function (namespace) {
    var plugin = pluginService.getPlugin(namespace);
    return pluginService.sanitizePlugins(plugin, this);
};

Session.prototype.updatePlugin = function (namespace, plugin) {
    return pluginService.updatePlugin(namespace, plugin, this);
};

Session.prototype.addTimer = function (seconds, onFinish) {
    var self = this;
    var timer = new Timer(seconds, onFinish, function () {
        delete self.timers[timer.id];
    });
    this.timers[timer.id] = timer;
    return timer;
};

Session.prototype.processExpression = function (input) {
    var dfd = Q.defer();

    var inputExpression = new Expression(input);
    inputExpression.process();

    var pushedInputToTranscript = false;

    var self = this;
    this.processIntent(inputExpression).then(function (result) {
        var response = result.response;
        var matchedClassification = result.matchedClassification;

        self._expectations = response.expectations || [];

        var data = {
            input: inputExpression,
            classification: matchedClassification,
            response: response.value,
            expectations: self._expectations
        };

        console.log(JSON.stringify({
            input: data.input.value,
            trigger: data.classification ? data.classification.trigger : "",
            confidence: data.classification ? data.classification.confidence : 0,
            response: data.response,
            expectations: data.expectations
        }, null, "  "));

        if (!pushedInputToTranscript) {
            self._transcript.push(inputExpression.value);
        }
        self._transcript.push(response.value);

        dfd.resolve(data);
    }, function (e) {
        console.log("Session: unexpected error: " + e);
    }, function (intermediateResponse) {
        var response = intermediateResponse.response;
        var matchedClassification = intermediateResponse.matchedClassification;

        self._expectations = response.expectations || [];

        var data = {
            input: inputExpression,
            classification: matchedClassification,
            response: response.value,
            expectations: self._expectations
        };

        console.log(JSON.stringify({
            input: data.input.value,
            trigger: data.classification ? data.classification.trigger : "",
            confidence: data.classification ? data.classification.confidence : 0,
            response: data.response,
            expectations: data.expectations
        }, null, "  "));

        if (!pushedInputToTranscript) {
            self._transcript.push(inputExpression.value);
        }
        self._transcript.push(response.value);

        dfd.notify(data);
    });

    return dfd.promise;
};

Session.prototype.processIntent = function (inputExpression) {
    var dfd = Q.defer();

    var matchedClassification;

    var i;
    var matchers = [];
    var examples = [];
    var triggers = {};
    var plugins = pluginService.getEnabledPlugins();
    var option;
    var customPluginIntent = [];

    for (i = 0; i < plugins.length; i++) {
        matchers = matchers.concat(plugins[i].intentMatchers);
        examples = examples.concat(plugins[i].examples);
        utils.extend(triggers, plugins[i].triggers);

        if (plugins[i].options) {
            for (option in plugins[i].options) {
                if (plugins[i].options.hasOwnProperty(option) && plugins[i].options[option].intentArray) {
                    var name = plugins[i].namespace + "." + option;
                    if (this.memory && this.memory[name] instanceof Array) {
                        customPluginIntent = customPluginIntent.concat(memories[name]);
                    }
                }
            }
        }
    }

    for (i = 0; i < customPluginIntent.length; i++) {
        matchers.push(new intentService.Matcher(customPluginIntent[i].value, customPluginIntent[i].trigger, customPluginIntent[i].expectations));
    }

    // Reverse sort by specificity so the most specific matcher is at the top
    matchers.sort(function (a, b) {
        if (a.specificity > b.specificity) {
            return -1;
        }
        if (b.specificity > a.specificity) {
            return 1;
        }
        return 0;
    });

    // If there are any expectations, add them as the matchers to check first
    var expectation;
    for (i = 0; i < this._expectations.length; i++) {
        expectation = this._expectations[i];
        matchers.unshift(new intentService.Matcher(expectation.value, expectation.trigger, expectation.expectations));
    }

    var input = inputExpression.normalized.replace(/^please\s/i, "");
    input = input.replace(/\s(thank you|thanks|please)$/i, "");
    var matchedIntent = intentService.matchInputToIntent(input, matchers);
    if (matchedIntent.confidence > 0.6) {
        matchedClassification = {
            trigger: matchedIntent.intent,
            confidence: matchedIntent.confidence,
            namedWildcards: matchedIntent.namedWildcards
        };
    }

    if (matchedClassification && matchedClassification.confidence > 0.5) {

        var namedValues = matchedClassification.namedWildcards || {};

        this.processTrigger(matchedClassification.trigger, inputExpression, triggers, namedValues, examples).then(
            function (response) {
                dfd.resolve({
                    response: response,
                    matchedClassification: matchedClassification
                });
            }, function () {
                dfd.resolve({
                    response: responseService.getUnknownResponse(inputExpression),
                    matchedClassification: matchedClassification
                });
            }, function (response) {
                dfd.notify({
                    response: response,
                    matchedClassification: matchedClassification
                });
            });
    } else {

        if (matchedClassification) {
            console.log("Session: Classification found but low confidence: " + matchedClassification.trigger + " = " + matchedClassification.confidence);
        }

        dfd.resolve({
            response: responseService.getUnknownResponse(inputExpression),
            matchedClassification: matchedClassification
        });
    }

    return dfd.promise;
};

/**
 * Takes the matched trigger and resolves a Response.
 * This takes String or Object responses, gets a single response from the set and wraps it in a Response object.
 *
 * @param triggerKey
 * @param inputExpression
 * @param triggers
 * @param namedValues
 * @param examples
 * @returns {Promise.<Response>}
 * @private
 */
Session.prototype.processTrigger = function (triggerKey, inputExpression, triggers, namedValues, examples) {
    var dfd = Q.defer();

    if (!triggerKey) {
        return Q.resolve(responseService.getUnknownResponse(inputExpression));
    }

    var triggerParams = [];
    if (triggerKey.indexOf('(') >= 0 && triggerKey.indexOf(')') === triggerKey.length - 1) {
        var dataString = triggerKey.substring(triggerKey.indexOf('(') + 1, triggerKey.length - 1);
        triggerKey = triggerKey.substring(0, triggerKey.indexOf('('));
        triggerParams = dataString.split(",");
    }

    var i;
    for (i = 0; i < triggerParams.length; i++) {
        triggerParams[i] = triggerParams[i].trim();
    }

    var intentData = {
        triggerParams: triggerParams,
        namedValues: namedValues || {}
    };

    if (triggerKey && triggers[triggerKey]) {
        var triggerDfd = Q.defer();

        var trigger = triggers[triggerKey];
        var self = this;

        var utils = {
            getMemory: function (name) {
                return self.getMemory(trigger.namespace + '.' + name);
            },
            setMemory: function (name, value) {
                self.setMemory(trigger.namespace + '.' + name, value);
            },
            getExamples: function () {
                return examples;
            },
            addTimer: function (seconds, onFinish) {
                return self.addTimer(seconds, onFinish);
            },
            getTimer: function (id) {
                return self.timers[id] || null;
            }
        };

        triggerDfd.promise.then(function (triggerResponses) {
            var responses = responseService.getResponses(triggerResponses);
            dfd.resolve(responseService.getBestResponse(responses));
        }, function () {
            dfd.resolve(responseService.getUnknownResponse(inputExpression));
        }, function (triggerResponses) {
            var responses = responseService.getResponses(triggerResponses);
            dfd.notify(responseService.getBestResponse(responses));
        });

        trigger.method(triggerDfd, inputExpression, utils, intentData);

        return dfd.promise;
    }

    return Q.resolve(responseService.getUnknownResponse(inputExpression));
};

module.exports = Session;
},{"./expression":32,"./intentService":33,"./memory":35,"./pluginService":44,"./responseService":46,"./timer":49,"./utils":50,"Q":1}],48:[function(require,module,exports){
var Session = require("./session");
var utils = require("./utils");

var sessionService = {
    sessions: {}
};

sessionService.getOrCreateSession = function (id, username) {
    if (this.sessions.hasOwnProperty(id)) {
        return this.sessions[id];
    }

    var session = new Session();
    session.link(username);
    this.sessions[id] = session;

    return session;
};

sessionService.newSession = function (userConfig) {
    var id = utils.generateUuid();
    var session = new Session();
    this.sessions[id] = session;

    if (userConfig) {
        session.loadUserConfig(config);
    }

    return session;
};

sessionService.getSession = function (id) {
    if (this.sessions.hasOwnProperty(id)) {
        return this.sessions[id];
    }
    return null;
};

module.exports = sessionService;
},{"./session":47,"./utils":50}],49:[function(require,module,exports){
var moment = require("moment");

var utils = require("./utils");

var Timer = function (seconds, onFinish, onStop) {
    this.id = utils.generateUuid();
    this.running = false;
    this.duration = seconds;
    this.interval = null;
    this.onFinish = onFinish;
    this.onStop = onStop;
};

Timer.prototype.checkTime = function () {
    if (this.running && moment().isAfter(this.endTime)) {
        clearInterval(this.interval);
        this.onFinish();
        this.onStop();
    }
};

Timer.prototype.start = function () {
    if (!this.running) {

        console.log("Timer: timer started for " + this.duration + " seconds.");

        this.startTime = moment();
        this.endTime = moment(this.startTime).add(this.duration, "s");
        this.running = true;
        this.interval = setInterval(this.checkTime.bind(this), 1000);
    }
};

Timer.prototype.pause = function () {
    if (this.running) {
        this.duration = this.getRemaining();

        clearInterval(this.interval);
        this.running = false;
    }
};

Timer.prototype.stop = function () {
    clearInterval(this.interval);
    this.running = false;
    this.onStop();
};

Timer.prototype.getRemaining = function () {
    if (this.endTime) {
        var duration = moment.duration(this.endTime.diff(moment()));
        return duration.asSeconds();
    }

    return this.duration;
};

module.exports = Timer;
},{"./utils":50,"moment":30}],50:[function(require,module,exports){
var utils = {};

utils.generateUuid = function () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16|0, v = c === 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
};

utils.extend = function () {

    var options, name, src, copy, copyIsArray, clone;
    var target = arguments[0];
    var i = 1;
    var length = arguments.length;
    var deep = true; // Deep by default

    // Handle a shallow copy situation
    if (typeof target === 'boolean') {
        deep = target;
        target = arguments[1] || {};
        // skip the boolean and the target
        i = 2;
    }
    if (target == null || (typeof target !== 'object' && typeof target !== 'function')) {
        target = {};
    }

    for (; i < length; ++i) {
        options = arguments[i];
        // Only deal with non-null/undefined values
        if (options != null) {
            // Extend the base object
            for (name in options) {
                src = target[name];
                copy = options[name];

                // Prevent never-ending loop
                if (target !== copy) {
                    // Recurse if we're merging plain objects or arrays
                    if (deep && copy && (isPlainObject(copy) || (copyIsArray = isArray(copy)))) {
                        if (copyIsArray) {
                            copyIsArray = false;
                            clone = src && isArray(src) ? src : [];
                        } else {
                            clone = src && isPlainObject(src) ? src : {};
                        }

                        // Never move original objects, clone them
                        target[name] = utils.extend(deep, clone, copy);

                        // Don't bring in undefined values
                    } else if (typeof copy !== 'undefined') {
                        target[name] = copy;
                    }
                }
            }
        }
    }

    // Return the modified object
    return target;
};

var hasOwn = Object.prototype.hasOwnProperty;
var toStr = Object.prototype.toString;

var isArray = function isArray(arr) {
    if (typeof Array.isArray === 'function') {
        return Array.isArray(arr);
    }

    return toStr.call(arr) === '[object Array]';
};

var isPlainObject = function isPlainObject(obj) {
    if (!obj || toStr.call(obj) !== '[object Object]') {
        return false;
    }

    var hasOwnConstructor = hasOwn.call(obj, 'constructor');
    var hasIsPrototypeOf = obj.constructor && obj.constructor.prototype && hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
    // Not own constructor property must be Object
    if (obj.constructor && !hasOwnConstructor && !hasIsPrototypeOf) {
        return false;
    }

    // Own properties are enumerated firstly, so to speed up,
    // if last one is own, then all properties are own.
    var key;
    for (key in obj) { /**/ }

    return typeof key === 'undefined' || hasOwn.call(obj, key);
};

module.exports = utils;
},{}],51:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],52:[function(require,module,exports){
(function (setImmediate,clearImmediate){
var nextTick = require('process/browser.js').nextTick;
var apply = Function.prototype.apply;
var slice = Array.prototype.slice;
var immediateIds = {};
var nextImmediateId = 0;

// DOM APIs, for completeness

exports.setTimeout = function() {
  return new Timeout(apply.call(setTimeout, window, arguments), clearTimeout);
};
exports.setInterval = function() {
  return new Timeout(apply.call(setInterval, window, arguments), clearInterval);
};
exports.clearTimeout =
exports.clearInterval = function(timeout) { timeout.close(); };

function Timeout(id, clearFn) {
  this._id = id;
  this._clearFn = clearFn;
}
Timeout.prototype.unref = Timeout.prototype.ref = function() {};
Timeout.prototype.close = function() {
  this._clearFn.call(window, this._id);
};

// Does not start the time, just sets up the members needed.
exports.enroll = function(item, msecs) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = msecs;
};

exports.unenroll = function(item) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = -1;
};

exports._unrefActive = exports.active = function(item) {
  clearTimeout(item._idleTimeoutId);

  var msecs = item._idleTimeout;
  if (msecs >= 0) {
    item._idleTimeoutId = setTimeout(function onTimeout() {
      if (item._onTimeout)
        item._onTimeout();
    }, msecs);
  }
};

// That's not how node.js implements it but the exposed api is the same.
exports.setImmediate = typeof setImmediate === "function" ? setImmediate : function(fn) {
  var id = nextImmediateId++;
  var args = arguments.length < 2 ? false : slice.call(arguments, 1);

  immediateIds[id] = true;

  nextTick(function onNextTick() {
    if (immediateIds[id]) {
      // fn.call() is faster so we optimize for the common use-case
      // @see http://jsperf.com/call-apply-segu
      if (args) {
        fn.apply(null, args);
      } else {
        fn.call(null);
      }
      // Prevent ids from leaking
      exports.clearImmediate(id);
    }
  });

  return id;
};

exports.clearImmediate = typeof clearImmediate === "function" ? clearImmediate : function(id) {
  delete immediateIds[id];
};
}).call(this,require("timers").setImmediate,require("timers").clearImmediate)
},{"process/browser.js":51,"timers":52}],"bishop-ai-coinflip":[function(require,module,exports){
var CoinFlip = function () {

    this.intent = [
        {value: "heads or tails", trigger: "coinflip.flip"},
        {value: "flip a coin", trigger: "coinflip.flip"},
        {value: "coin toss", trigger: "coinflip.flip"}
    ];

    this.triggers = {
        flip: function (dfd) {
            var state = (Math.floor(Math.random() * 2) === 0) ? 'heads' : 'tails';
            dfd.resolve([
                "It's " + state
            ]);
        }
    };
};

module.exports = {
    namespace: 'coinflip',
    description: 'Flip a Coin',
    examples: [
        "Heads or tails?",
        "Flip a coin"
    ],
    register: function () {
        return new CoinFlip();
    }
};
},{}],"bishop-ai-core":[function(require,module,exports){
var api = require("./src/api");
module.exports = api;
},{"./src/api":31}],"bishop-ai-smalltalk":[function(require,module,exports){
var SmallTalk = function (nlp) {

    this.intent = [
        {
            value: "(hi|hello|hey|what [is] up|what is happening|yo|sup|good (morning|evening|afternoon)) *",
            trigger: "smalltalk.greeting"
        },
        {
            value: "([i will] (see|talk to) you later|see you|later|[and] i am (off|out)|i am leaving|bye|goodbye|[have a] good (night|day)|have a good (morning|evening|afternoon)) *",
            trigger: "smalltalk.farewell"
        },
        {
            value: "You are *",
            trigger: "smalltalk.compliment"
        },
        {
            value: "I (love|adore|can not live without|like|dislike|can not stand|despise|hate) you",
            trigger: "smalltalk.compliment"
        },
        {
            value: "(thank you|thanks)",
            trigger: "smalltalk.gratitude"
        },
        {
            value: "how (are|have) you [been] [(doing|feeling)] *",
            trigger: "smalltalk.getAiInfo"
        },
        {
            value: "how is it going *",
            trigger: "smalltalk.getAiInfo"
        },
        {
            value: "what (is your name|do you call yourself|should I call you)",
            trigger: "smalltalk.getAiInfo"
        },
        {
            value: "who are you",
            trigger: "smalltalk.getAiInfo"
        },
        {
            value: "who am I talking to",
            trigger: "smalltalk.getAiInfo"
        },
        {
            value: "where are you",
            trigger: "smalltalk.getAiInfo"
        },
        {
            value: "do I know [who] you [are]",
            trigger: "smalltalk.getAiInfo"
        },
        {
            value: "what [(other|else|[kind of] (things|tasks|jobs))] (can I ask you to|are you able to|can you) do [for me]",
            trigger: "smalltalk.getAiInfo"
        },
        {
            value: "what [(other|else|[kind of] (things|questions))] can (I ask [you [about]]|you answer [for me])",
            trigger: "smalltalk.getAiInfo"
        },
        {
            value: "what are you (doing|up to|working on|thinking about)",
            trigger: "smalltalk.getAiThoughts"
        },
        {
            value: "do you know ([what] my name [is]|who I am|me|who you are (talking|speaking) (to|with))",
            trigger: "smalltalk.getUserName"
        },
        {
            value: "(what is my name|who am I)",
            trigger: "smalltalk.getUserName"
        },
        {
            value: "(your name (is|will be)|i will (call|name) you) *name",
            trigger: "smalltalk.setAiName"
        },
        {
            value: "I [already] (said|told you) that [already] *",
            trigger: "smalltalk.apologize"
        }
    ];

    this.triggers = {

        greeting: function (dfd, expression, utils) {
            var name = utils.getMemory('userName');

            var responses = [
                "(Hello|Hi). [(How can I (help [you]|be of assistance)|What can I (help you with|do for you))?]",
                "Hey there!"
            ];

            var dt = new Date().getHours();
            if (dt >= 0 && dt <= 11) {
                responses.push({value: "Good morning.", weight: 2});
            } else if (dt >= 12 && dt <= 17) {
                responses.push({value: "Good afternoon.", weight: 2});
            } else {
                responses.push({value: "Good evening.", weight: 2});
            }

            if (name) {
                responses = responses.concat([
                    {
                        value: "(Hello|Hi) " + name + ". [(How can I (help [you]|be of assistance)|What can I (help you with|do for you))?]",
                        weight: 3
                    },
                    {
                        value: "(Hello|Hi). (How can I (help [you]|be of assistance)|What can I (help you with|do for you)) " + name + "?",
                        weight: 3
                    },
                    {
                        value: name + "! Nice to see you again.",
                        weight: 3
                    }
                ]);
                if (dt >= 0 && dt <= 11) {
                    responses.push({
                        value: "Good morning " + name + ". [(How can I (help [you]|be of assistance)|What can I (help you with|do for you))?]",
                        weight: 4
                    });
                } else if (dt >= 12 && dt <= 17) {
                    responses.push({
                        value: "Good afternoon " + name + ". [(How can I (help [you]|be of assistance)|What can I (help you with|do for you))?]",
                        weight: 4
                    });
                } else {
                    responses.push({
                        value: "Good evening " + name + ". [(How can I (help [you]|be of assistance)|What can I (help you with|do for you))?]",
                        weight: 4
                    });
                }
            }

            if (!name) {
                responses = responses.concat([
                    {
                        value: "(Hi|Hello). [I don't (think|believe) we've (met|been [properly] introduced).] What is your name?",
                        expectations: [
                            {value: "[(it is|my name is|you can call me)] *name", trigger: "smalltalk.setUserName"}
                        ]
                    }
                ]);
            }

            dfd.resolve(responses);
        },

        farewell: function (dfd, expression, utils) {
            var name = utils.getMemory('userName');

            var responses = [
                "Goodbye!",
                "Talk to you later."
            ];

            var dt = new Date().getHours();
            if (dt >= 0 && dt <= 8) {
                responses.push({value: "Have a good morning.", weight: 2});
            } else if (dt >= 9 && dt <= 14) {
                responses.push({value: "Have a good afternoon.", weight: 2});
            } else if (dt >= 15 && dt <= 20) {
                responses.push({value: "Have a good evening.", weight: 2});
            } else {
                responses.push({value: "(Have a good|Good) night.", weight: 2});
            }

            if (name) {
                responses = responses.concat([
                    {value: "Goodbye " + name + ".", weight: 3},
                    {value: "Talk to you later " + name + ".", weight: 3}
                ]);
                if (dt >= 0 && dt <= 8) {
                    responses.push({value: "Have a good morning " + name + ".", weight: 2});
                } else if (dt >= 9 && dt <= 14) {
                    responses.push({value: "Have a good afternoon " + name + ".", weight: 2});
                } else if (dt >= 15 && dt <= 20) {
                    responses.push({value: "Have a good evening " + name + ".", weight: 2});
                } else {
                    responses.push({value: "(Have a good|Good) night " + name + ".", weight: 2});
                }
            }

            dfd.resolve(responses);
        },

        compliment: function (dfd, expression, utils) {
            var responses = [];

            var name = utils.getMemory('userName');

            var sentiment = expression.analysis[0].profile.sentiment;

            if (sentiment < 0) {
                responses = responses.concat([
                    "That wasn't [very] (nice|kind)."
                ]);
                if (name) {
                    responses = responses.concat([
                        {value: "That wasn't [very] (nice|kind) " + name + ".", weight: 2}
                    ]);
                }
            } else if (sentiment === 0 && !expression.contains("friend")) {
                responses = responses.concat([
                    "I am a just a rather very intelligent system.",
                    "I am your personal assistant."
                ]);
            } else {
                responses = responses.concat([
                    "You shouldn't...",
                    "(Thank you|Thanks)!",
                    "Why thank you!"
                ]);
                if (name) {
                    responses = responses.concat([
                        {
                            value: "[(Thanks|Thank you)!] That is [very] (nice|kind) [of you] " + name + ".",
                            weight: 2
                        },
                        {
                            value: "(Thank you|Thanks) " + name + ".",
                            weight: 2
                        }
                    ]);
                }
            }

            dfd.resolve(responses);
        },

        gratitude: function (dfd, expression, utils) {
            var name = utils.getMemory('userName');

            var responses = [
                "(You're [very] welcome|No problem).",
                "I'm happy to help!"
            ];

            if (name) {
                responses = responses.concat([
                    {value: "(You're [very] welcome|No problem) " + name + ".", weight: 2}
                ]);
            }

            dfd.resolve(responses);
        },

        getAiInfo: function (dfd, expression, utils) {
            var responses = [];

            var name = utils.getMemory('aiName');

            if (expression.contains('who')) {
                responses = responses.concat([
                    "I am your personal assistant."
                ]);
                if (name) {
                    responses = responses.concat([
                        {value: "I am your personal assistant " + name + ".", weight: 2}
                    ]);
                } else {
                    responses = responses.concat([
                        {
                            value: "I am your personal assistant. What ((would you like|do you want) to (call|name) me|should my name be)?",
                            weight: 2,
                            expectations: [
                                {
                                    value: "[(your name is|i will call you|it is|how about|what about)] *name",
                                    trigger: "smalltalk.setAiName"
                                }
                            ]
                        }
                    ]);
                }
            } else if (expression.contains('how')) {
                responses = [
                    {
                        value: "I'm doing (well|fine|great), [(thanks|thank you),] ([and] (how|what) about you|[and] how are you [doing]|and yourself)?",
                        expectations: [
                            {
                                value: "(well|ok|good|fine|great|awesome|awful|terrible|miserable|not good|bad|not great|not awesome|i (am [feeling]|have been) *)",
                                trigger: "smalltalk.setUserFeeling"
                            }
                        ]
                    }
                ];
            } else if (expression.contains("what") && expression.contains("skills", "you do", "ask", "questions", "answer")) {
                var examples = nlp.shuffle(utils.getExamples().slice(0));
                var max = Math.min(examples.length, 5);

                var response = "Here are [(some|a (few|couple))] [examples of] things you can say or ask: ";
                var addComma = false;

                var i;
                for (i = 0; i < max; i++) {
                    if (examples[i]) {
                        if (addComma) {
                            response += ", ";
                        }
                        response += "'" + examples[i] + "'";
                        addComma = true;
                    }
                }

                responses.push(response);
            } else if (expression.contains('where')) {
                responses = [
                    {value: "I exist within the constructs of a computer program."}
                ];
            } else {
                if (name) {
                    responses.push("[(My name is|You can call me)] " + name + ".");
                } else {
                    responses = responses.concat([
                        "(I don't know|I'm not sure) what my name is.",
                        "No one has ever given me a name.",
                        {
                            value: "[(I don't know|I'm not sure) what my name is.] What ((would you like|do you want) to (call|name) me|should my name be)?",
                            expectations: [
                                {
                                    value: "[(your name is|i will call you|it is|how about|what about)] *name",
                                    trigger: "smalltalk.setAiName"
                                }
                            ]
                        }
                    ]);
                }
            }

            dfd.resolve(responses);
        },

        getAiThoughts: function (dfd, expression) {
            var responses = [];

            responses = responses.concat([
                "I'm (thinking about|pondering) (life|gravity|the mysteries of the universe|the meaning of life)."
            ]);

            if (expression.contains("doing")) {
                responses = responses.concat([
                    "I'm thinking."
                ]);
            } else if (expression.contains("thinking")) {
                responses = responses.concat([
                    "About (life|gravity|the mysteries of the universe|the meaning of life)."
                ]);
            }

            dfd.resolve(responses);
        },

        setAiBirthday: function (dfd, expression, utils) {
            var i;
            var birthday;

            var entities = nlp.ner(expression.normalized, expression);
            for (i = 0; i < entities.length; i++) {
                if (entities[i].type === 'person.age') {
                    birthday = entities[i].value;
                    break;
                }
            }

            if (birthday) {
                utils.setMemory('aIBirthday', birthday);
                dfd.resolve();
            } else {
                dfd.reject();
            }
        },

        getAiAge: function (dfd, expression, utils) {
            var responses = [];
            var i;
            var timeFromNow;

            var entities = nlp.ner(expression.normalized);
            for (i = 0; i < entities.length; i++) {
                if (entities[i].type === 'datetime.datetime') {
                    timeFromNow = entities[i].value;
                    break;
                }
            }

            var birthday = utils.getMemory('aIBirthday');
            if (birthday) {
                var timeFrom;
                if (timeFromNow) {
                    timeFrom = moment(birthday).from(timeFromNow, true);
                    responses.push("You were " + timeFrom + " old."); // TODO: will be
                } else {
                    timeFrom = moment(birthday).fromNow(true);
                    responses.push("You are " + timeFrom + " old.");
                }
            } else {
                responses.push("(I'm not sure|I don't know) (how old|what age) I am.");
            }

            dfd.resolve(responses);
        },

        setAiName: function (dfd, expression, utils, intentData) {
            var i;
            var name;

            if (intentData.namedValues.name) {
                name = intentData.namedValues.name;
            } else {
                var entities = nlp.ner(expression.normalized, expression);
                for (i = 0; i < entities.length; i++) {
                    if (entities[i].type === 'person.name') {
                        name = entities[i].value;
                        break;
                    }
                }
            }

            if (name) {
                utils.setMemory('aiName', name);
                dfd.resolve([
                    "[That's a (great|good) name.] You (can|may) now call me " + name + ".",
                    "From hence forth I shall be " + name + " the (mighty|magnificent|omnipotent|all knowing|all powerful)!"
                ]);
            } else {
                dfd.reject();
            }
        },

        setUserBirthday: function (dfd, expression, utils) {
            var i;
            var birthday;

            var entities = nlp.ner(expression.normalized, expression);
            for (i = 0; i < entities.length; i++) {
                if (entities[i].type === 'person.age') {
                    birthday = entities[i].value;
                    break;
                }
            }

            if (birthday) {
                utils.setMemory('userBirthday', birthday);
                dfd.resolve();
            } else {
                dfd.reject();
            }
        },

        getUserAge: function (dfd, expression, utils) {
            var responses = [];
            var i;
            var timeFromNow;

            var entities = nlp.ner(expression.normalized);
            for (i = 0; i < entities.length; i++) {
                if (entities[i].type === 'datetime.datetime') {
                    timeFromNow = entities[i].value;
                    break;
                }
            }

            var birthday = utils.getMemory('userBirthday');
            if (birthday) {
                var timeFrom;
                if (timeFromNow) {
                    timeFrom = moment(birthday).from(timeFromNow, true);
                    responses.push("You were " + timeFrom + " old."); // TODO: will be
                } else {
                    timeFrom = moment(birthday).fromNow(true);
                    responses.push("You are " + timeFrom + " old.");
                }
            } else {
                responses.push("(I'm not sure|I don't know) (how old|what age) you are.");
            }

            dfd.resolve(responses);
        },

        setUserName: function (dfd, expression, utils, intentData) {
            var i;
            var name;

            if (intentData.namedValues.name) {
                name = intentData.namedValues.name;
            } else {
                var entities = nlp.ner(expression.normalized, expression);
                for (i = 0; i < entities.length; i++) {
                    if (entities[i].type === 'person.name') {
                        name = entities[i].value;
                        break;
                    }
                }
            }

            if (name) {
                utils.setMemory('userName', name);
                var responses = [
                    "It's (nice|great|a pleasure) to (meet you|make your acquaintance), " + name + "."
                ];
                dfd.resolve(responses);
            } else {
                dfd.reject();
            }
        },

        getUserName: function (dfd, expression, utils) {
            var responses = [];

            var name = utils.getMemory('userName');

            if (name) {
                responses.push("Your name is " + name + ".");
            } else {
                responses.push({
                    value: "(I'm not sure|I don't know). What is your name?", expectations: [
                        {value: "[(it is|my name is|you can call me)] *name", trigger: "smalltalk.setUserName"}
                    ]
                });
            }

            dfd.resolve(responses);
        },

        setUserFeeling: function (dfd, expression) {
            var responses = [];

            var sentiment = expression.analysis[0].profile.sentiment;

            if (sentiment < 0) {
                responses.push("I'm [very] (sorry|sad) to hear that.");
            } else if (sentiment === 0 && !expression.contains("ok")) {
                responses.push({
                    value: "[I'm not sure I understand. ]What do you mean?", expectations: [
                        {
                            value: "(well|ok|good|fine|great|awesome|awful|terrible|miserable|not good|bad|not great|not awesome|i (am [feeling]|have been) *)",
                            trigger: "smalltalk.setUserFeeling"
                        }
                    ]
                });
            } else {
                responses.push("I'm [very] (glad|happy) to hear that.");
            }

            dfd.resolve(responses);
        },

        apologize: function (dfd, expression) {
            var responses = [];

            var sentiment = expression.analysis[0].profile.sentiment;

            if (sentiment < 0) {
                responses.push("I'm (very|terribly) sorry.");
            } else {
                responses.push("(I'm sorry|I apologize).");
            }

            if (expression.contains("already") && expression.contains("said", "told")) {
                if (sentiment < 0) {
                    responses.push("I'm (very|terribly) sorry. I must have forgotten [that you (said|told me) that].");
                } else {
                    responses.push("(I'm sorry|I apologize). I must have forgotten [that you (said|told me) that].");
                }
            }

            dfd.resolve(responses);
        }
    };
};

module.exports = {
    namespace: "smalltalk",
    description: "Some small talk",
    examples: [
        "What is your name?",
        "What can you do?",
        "How are you?"
    ],
    register: function (config, nlp) {
        return new SmallTalk(nlp);
    }
};
},{}],"bishop-ai-timer":[function(require,module,exports){
var Timer = function (nlp) {

    this.intent = [
        {value: "(set|start) [(a|the)] timer for *duration", trigger: "timer.startTimer"},
        {value: "(how much|what) time is (left|[left] on the (timer|stopwatch))", trigger: "timer.getRemaining"},
        {value: "(stop|cancel) [the] timer", trigger: "timer.stopTimer"}
    ];

    this.triggers = {
        startTimer: function (dfd, expression, utils, data) {
            if (data.namedValues.duration) {
                var seconds = nlp.ner(data.namedValues.duration);

                var timer = utils.addTimer(seconds, function () {
                    utils.setMemory("timer", null);
                    dfd.resolve("(Time's up|(The|Your) timer has finished).");
                });

                dfd.notify("The timer has been set for " + nlp.humanizeDuration(timer.getRemaining()));

                timer.start();
                utils.setMemory("timer", timer.id);

            } else {
                dfd.reject();
            }
        },
        stopTimer: function (dfd, expression, utils) {
            var timerId = utils.getMemory("timer");

            if (timerId) {
                utils.getTimer(timerId).stop();
                utils.setMemory("timer", null);
                dfd.resolve("The timer has been stopped.");
            } else {
                dfd.resolve("There is not a timer running.");
            }
        },
        getRemaining: function (dfd, expression, utils) {
            var timerId = utils.getMemory("timer");

            if (timerId) {
                var duration = nlp.humanizeDuration(utils.getTimer(timerId).getRemaining());

                if (duration.indexOf("and") >= 0 || duration.substr(duration.length - 1) === "s") {
                    dfd.resolve("There are " + duration + " left.");
                } else {
                    dfd.resolve("There is " + duration + " left.");
                }
            } else {
                dfd.resolve("There is not a timer running.");
            }
        }
    };
};

module.exports = {
    namespace: 'timer',
    description: 'Set Timers',
    examples: [
        "Set a timer for fifteen minutes",
        "How much time is left?",
        "Stop the timer."
    ],
    register: function (config, nlp) {
        return new Timer(nlp);
    }
};
},{}]},{},["bishop-ai-core","bishop-ai-coinflip","bishop-ai-smalltalk","bishop-ai-timer"]);
