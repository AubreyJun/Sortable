/**!
 * Sortable
 * @author	RubaXa   <trash@rubaxa.org>
 * @license MIT
 */


(function (factory) {
	"use strict";

	if (typeof define === "function" && define.amd) {
		define(factory);
	}
	else if (typeof module != "undefined" && typeof module.exports != "undefined") {
		module.exports = factory();
	}
	else if (typeof Package !== "undefined") {
		Sortable = factory();  // export for Meteor.js
	}
	else {
		/* jshint sub:true */
		window["Sortable"] = factory();
	}
})(function () {
	"use strict";

	var dragEl,
		ghostEl,
		cloneEl,
		rootEl,
		scrollEl,
		nextEl,

		lastEl,
		lastCSS,

		activeGroup,
		autoScroll = {},

		tapEvt,
		touchEvt,

		expando = 'Sortable' + (new Date).getTime(),

		win = window,
		document = win.document,
		parseInt = win.parseInt,
		supportIEdnd = !!document.createElement('div').dragDrop,

		_silent = false,

		_dispatchEvent = function (el, name, targetEl, fromEl) {
			var evt = document.createEvent('Event');

			evt.initEvent(name, true, true);
			evt.item = targetEl || el;
			evt.from = fromEl || el;

			el.dispatchEvent(evt);
		},

		_customEvents = 'onAdd onUpdate onRemove onStart onEnd onFilter onSort'.split(' '),

		noop = function () {},

		abs = Math.abs,
		slice = [].slice,

		touchDragOverListeners = []
	;



	/**
	 * @class  Sortable
	 * @param  {HTMLElement}  el
	 * @param  {Object}       [options]
	 */
	function Sortable(el, options) {
		this.el = el; // root element
		this.options = options = (options || {});


		// Default options
		var defaults = {
			group: Math.random(),
			sort: true,
			store: null,
			handle: null,
			scroll: true,
			scrollSensitivity: 30,
			scrollSpeed: 10,
			draggable: el.children[0] && el.children[0].nodeName || (/[uo]l/i.test(el.nodeName) ? 'li' : '*'),
			ghostClass: 'sortable-ghost',
			ignore: 'a, img',
			filter: null,
			animation: 0,
			setData: function (dataTransfer, dragEl) {
				dataTransfer.setData('Text', dragEl.textContent);
			}
		};


		// Set default options
		for (var name in defaults) {
			!(name in options) && (options[name] = defaults[name]);
		}


		if (!options.group.name) {
			options.group = { name: options.group };
		}


		['pull', 'put'].forEach(function (key) {
			if (!(key in options.group)) {
				options.group[key] = true;
			}
		});


		// Define events
		_customEvents.forEach(function (name) {
			options[name] = _bind(this, options[name] || noop);
			_on(el, name.substr(2).toLowerCase(), options[name]);
		}, this);


		// Export group name
		el[expando] = options.group.name;


		// Bind all private methods
		for (var fn in this) {
			if (fn.charAt(0) === '_') {
				this[fn] = _bind(this, this[fn]);
			}
		}


		// Bind events
		_on(el, 'mousedown', this._onTapStart);
		_on(el, 'touchstart', this._onTapStart);
		supportIEdnd && _on(el, 'selectstart', this._onTapStart);

		_on(el, 'dragover', this._onDragOver);
		_on(el, 'dragenter', this._onDragOver);

		touchDragOverListeners.push(this._onDragOver);

		// Restore sorting
		options.store && this.sort(options.store.get(this));
	}


	Sortable.prototype = /** @lends Sortable.prototype */ {
		constructor: Sortable,


		_applyEffects: function () {
			_toggleClass(dragEl, this.options.ghostClass, true);
		},


		_onTapStart: function (/**Event|TouchEvent*/evt) {
			var touch = evt.touches && evt.touches[0],
				target = (touch || evt).target,
				options =  this.options,
				el = this.el,
				filter = options.filter;


			if (evt.type === 'mousedown' && evt.button !== 0) {
				return; // only left button
			}

			// Check filter
			if (typeof filter === 'function') {
				if (filter.call(this, target, this)) {
					_dispatchEvent(el, 'filter', target);
					return; // cancel dnd
				}
			}
			else if (filter) {
				filter = filter.split(',').filter(function (criteria) {
					return _closest(target, criteria.trim(), el);
				});

				if (filter.length) {
					_dispatchEvent(el, 'filter', target);
					return; // cancel dnd
				}
			}

			if (options.handle) {
				target = _closest(target, options.handle, el);
			}

			target = _closest(target, options.draggable, el);

			// IE 9 Support
			if (target && evt.type == 'selectstart') {
				if (target.tagName != 'A' && target.tagName != 'IMG') {
					target.dragDrop();
				}
			}

			if (target && !dragEl && (target.parentNode === el)) {
				tapEvt = evt;

				rootEl = this.el;
				dragEl = target;
				nextEl = dragEl.nextSibling;
				activeGroup = this.options.group;

				dragEl.draggable = true;

				// Disable "draggable"
				options.ignore.split(',').forEach(function (criteria) {
					_find(target, criteria.trim(), _disableDraggable);
				});

				if (touch) {
					// Touch device support
					tapEvt = {
						target: target,
						clientX: touch.clientX,
						clientY: touch.clientY
					};

					this._onDragStart(tapEvt, true);
					evt.preventDefault();
				}

				_on(document, 'mouseup', this._onDrop);
				_on(document, 'touchend', this._onDrop);
				_on(document, 'touchcancel', this._onDrop);

				_on(rootEl, 'dragstart', this._onDragStart);
				_on(rootEl, 'dragend', this._onDrop);

				_on(document, 'dragover', this);


				try {
					if (document.selection) {
						document.selection.empty();
					} else {
						window.getSelection().removeAllRanges();
					}
				} catch (err) {
				}


				_dispatchEvent(dragEl, 'start');


				if (activeGroup.pull == 'clone') {
					cloneEl = dragEl.cloneNode(true);
					_css(cloneEl, 'display', 'none');
					rootEl.insertBefore(cloneEl, dragEl);
				}
			}
		},

		_emulateDragOver: function () {
			if (touchEvt) {
				_css(ghostEl, 'display', 'none');

				var target = document.elementFromPoint(touchEvt.clientX, touchEvt.clientY),
					parent = target,
					groupName = this.options.group.name,
					i = touchDragOverListeners.length;

				if (parent) {
					do {
						if (parent[expando] === groupName) {
							while (i--) {
								touchDragOverListeners[i]({
									clientX: touchEvt.clientX,
									clientY: touchEvt.clientY,
									target: target,
									rootEl: parent
								});
							}

							break;
						}

						target = parent; // store last element
					}
					/* jshint boss:true */
					while (parent = parent.parentNode);
				}

				_css(ghostEl, 'display', '');
			}
		},


		_onTouchMove: function (/**TouchEvent*/evt) {
			if (tapEvt) {
				var touch = evt.touches[0],
					dx = touch.clientX - tapEvt.clientX,
					dy = touch.clientY - tapEvt.clientY,
					translate3d = 'translate3d(' + dx + 'px,' + dy + 'px,0)';

				touchEvt = touch;

				_css(ghostEl, 'webkitTransform', translate3d);
				_css(ghostEl, 'mozTransform', translate3d);
				_css(ghostEl, 'msTransform', translate3d);
				_css(ghostEl, 'transform', translate3d);

				this._onDrag(touch);
				evt.preventDefault();
			}
		},


		_onDragStart: function (/**Event*/evt, /**boolean*/isTouch) {
			var dataTransfer = evt.dataTransfer,
				options = this.options;

			this._offUpEvents();

			if (isTouch) {
				var rect = dragEl.getBoundingClientRect(),
					css = _css(dragEl),
					ghostRect;

				ghostEl = dragEl.cloneNode(true);

				_css(ghostEl, 'top', rect.top - parseInt(css.marginTop, 10));
				_css(ghostEl, 'left', rect.left - parseInt(css.marginLeft, 10));
				_css(ghostEl, 'width', rect.width);
				_css(ghostEl, 'height', rect.height);
				_css(ghostEl, 'opacity', '0.8');
				_css(ghostEl, 'position', 'fixed');
				_css(ghostEl, 'zIndex', '100000');

				rootEl.appendChild(ghostEl);

				// Fixing dimensions.
				ghostRect = ghostEl.getBoundingClientRect();
				_css(ghostEl, 'width', rect.width * 2 - ghostRect.width);
				_css(ghostEl, 'height', rect.height * 2 - ghostRect.height);

				// Bind touch events
				_on(document, 'touchmove', this._onTouchMove);
				_on(document, 'touchend', this._onDrop);
				_on(document, 'touchcancel', this._onDrop);

				this._loopId = setInterval(this._emulateDragOver, 150);
			}
			else {
				dataTransfer.effectAllowed = 'move';
				options.setData && options.setData.call(this, dataTransfer, dragEl);

				_on(document, 'drop', this);
			}

			setTimeout(this._applyEffects, 0);

			scrollEl = options.scroll;

			if (scrollEl === true) {
				scrollEl = dragEl;

				do {
					if ((scrollEl.offsetWidth < scrollEl.scrollWidth) ||
						(scrollEl.offsetHeight < scrollEl.scrollHeight)
					) {
						break;
					}
				/* jshint boss:true */
				} while (scrollEl = scrollEl.parentNode);
			}
		},

		_onDrag: _throttle(function (/**Event*/evt) {
			// Bug: https://bugzilla.mozilla.org/show_bug.cgi?id=505521
			if (rootEl && this.options.scroll) {
				var el,
					rect,
					options = this.options,
					sens = options.scrollSensitivity,
					speed = options.scrollSpeed,

					x = evt.clientX,
					y = evt.clientY,

					winWidth = window.innerWidth,
					winHeight = window.innerHeight,

					vx = (winWidth - x <= sens) - (x <= sens),
					vy = (winHeight - y <= sens) - (y <= sens)
				;

				if (vx || vy) {
					el = win;
				}
				else if (scrollEl) {
					el = scrollEl;
					rect = scrollEl.getBoundingClientRect();
					vx = (abs(rect.right - x) <= sens) - (abs(rect.left - x) <= sens);
					vy = (abs(rect.bottom - y) <= sens) - (abs(rect.top - y) <= sens);
				}

				if (autoScroll.vx !== vx || autoScroll.vy !== vy || autoScroll.el !== el) {
					autoScroll.el = el;
					autoScroll.vx = vx;
					autoScroll.vy = vy;

					clearInterval(autoScroll.pid);

					if (el) {
						autoScroll.pid = setInterval(function () {
							if (el === win) {
								win.scrollTo(win.scrollX + vx * speed, win.scrollY + vy * speed);
							} else {
								vy && (el.scrollTop += vy * speed);
								vx && (el.scrollLeft += vx * speed);
							}
						}, 24);
					}
				}
			}
		}, 30),


		_onDragOver: function (/**Event*/evt) {
			var el = this.el,
				target,
				dragRect,
				revert,
				options = this.options,
				group = options.group,
				groupPut = group.put,
				isOwner = (activeGroup === group);

			if (!_silent &&
				(activeGroup.name === group.name || groupPut && groupPut.indexOf && groupPut.indexOf(activeGroup.name) > -1) &&
				(isOwner && (options.sort || (revert = !rootEl.contains(dragEl))) || groupPut && activeGroup.pull) &&
				(evt.rootEl === void 0 || evt.rootEl === this.el)
			) {
				target = _closest(evt.target, options.draggable, el);
				dragRect = dragEl.getBoundingClientRect();

				if (cloneEl && (cloneEl.state !== isOwner)) {
					_css(cloneEl, 'display', isOwner ? 'none' : '');
					!isOwner && cloneEl.state && rootEl.insertBefore(cloneEl, dragEl);
					cloneEl.state = isOwner;
				}

				if (revert && cloneEl) {
					rootEl.insertBefore(dragEl, cloneEl);
					return;
				}

				if ((el.children.length === 0) || (el.children[0] === ghostEl) ||
					(el === evt.target) && (target = _ghostInBottom(el, evt))
				) {
					if (target) {
						if (target.animated) {
							return;
						}
						targetRect = target.getBoundingClientRect();
					}

					el.appendChild(dragEl);
					this._animate(dragRect, dragEl);
					target && this._animate(targetRect, target);
				}
				else if (target && !target.animated && target !== dragEl && (target.parentNode[expando] !== void 0)) {
					if (lastEl !== target) {
						lastEl = target;
						lastCSS = _css(target);
					}


					var targetRect = target.getBoundingClientRect(),
						width = targetRect.right - targetRect.left,
						height = targetRect.bottom - targetRect.top,
						floating = /left|right|inline/.test(lastCSS.cssFloat + lastCSS.display),
						isWide = (target.offsetWidth > dragEl.offsetWidth),
						isLong = (target.offsetHeight > dragEl.offsetHeight),
						halfway = (floating ? (evt.clientX - targetRect.left) / width : (evt.clientY - targetRect.top) / height) > 0.5,
						nextSibling = target.nextElementSibling,
						after
					;

					_silent = true;
					setTimeout(_unsilent, 30);

					if (floating) {
						after = (target.previousElementSibling === dragEl) && !isWide || halfway && isWide;
					} else {
						after = (nextSibling !== dragEl) && !isLong || halfway && isLong;
					}

					if (after && !nextSibling) {
						el.appendChild(dragEl);
					} else {
						target.parentNode.insertBefore(dragEl, after ? nextSibling : target);
					}
					
					this._animate(dragRect, dragEl);
					this._animate(targetRect, target);
				}
			}
		},

		_animate: function (prevRect, target) {
			var ms = this.options.animation;

			if (ms) {
				var currentRect = target.getBoundingClientRect();

				_css(target, 'transition', 'none');
				_css(target, 'transform', 'translate3d('
					+ (prevRect.left - currentRect.left) + 'px,'
					+ (prevRect.top - currentRect.top) + 'px,0)'
				);

				target.offsetWidth; // repaint

				_css(target, 'transition', 'all ' + ms + 'ms');
				_css(target, 'transform', 'translate3d(0,0,0)');

				clearTimeout(target.animated);
				target.animated = setTimeout(function () {
					_css(target, 'transition', '');
					target.animated = false;
				}, ms);
			}
		},

		_offUpEvents: function () {
			_off(document, 'mouseup', this._onDrop);
			_off(document, 'touchmove', this._onTouchMove);
			_off(document, 'touchend', this._onDrop);
			_off(document, 'touchcancel', this._onDrop);
		},

		_onDrop: function (/**Event*/evt) {
			var el = this.el;

			clearInterval(this._loopId);
			clearInterval(autoScroll.pid);

			// Unbind events
			_off(document, 'drop', this);
			_off(document, 'dragover', this);

			_off(el, 'dragend', this._onDrop);
			_off(el, 'dragstart', this._onDragStart);

			this._offUpEvents();

			if (evt) {
				evt.preventDefault();
				evt.stopPropagation();

				ghostEl && ghostEl.parentNode.removeChild(ghostEl);

				if (dragEl) {
					_disableDraggable(dragEl);
					_toggleClass(dragEl, this.options.ghostClass, false);

					if (!rootEl.contains(dragEl)) {
						_dispatchEvent(dragEl, 'sort');
						_dispatchEvent(rootEl, 'sort');

						// Add event
						_dispatchEvent(dragEl, 'add', dragEl, rootEl);

						// Remove event
						_dispatchEvent(rootEl, 'remove', dragEl);
					}
					else if (dragEl.nextSibling !== nextEl) {
						// Update event
						_dispatchEvent(dragEl, 'update');
						_dispatchEvent(dragEl, 'sort');

						cloneEl && cloneEl.parentNode.removeChild(cloneEl);
					}

					_dispatchEvent(rootEl, 'end');
				}

				// Set NULL
				rootEl =
				dragEl =
				ghostEl =
				nextEl =
				cloneEl =

				tapEvt =
				touchEvt =

				lastEl =
				lastCSS =

				activeGroup = null;

				// Save sorting
				this.options.store && this.options.store.set(this);
			}
		},


		handleEvent: function (/**Event*/evt) {
			var type = evt.type;

			if (type === 'dragover') {
				this._onDrag(evt);
				_globalDragOver(evt);
			}
			else if (type === 'drop') {
				this._onDrop(evt);
			}
		},


		/**
		 * Serializes the item into an array of string.
		 * @returns {String[]}
		 */
		toArray: function () {
			var order = [],
				el,
				children = this.el.children,
				i = 0,
				n = children.length;

			for (; i < n; i++) {
				el = children[i];
				if (_closest(el, this.options.draggable, this.el)) {
					order.push(el.getAttribute('data-id') || _generateId(el));
				}
			}

			return order;
		},


		/**
		 * Sorts the elements according to the array.
		 * @param  {String[]}  order  order of the items
		 */
		sort: function (order) {
			var items = {}, rootEl = this.el;

			this.toArray().forEach(function (id, i) {
				var el = rootEl.children[i];

				if (_closest(el, this.options.draggable, rootEl)) {
					items[id] = el;
				}
			}, this);


			order.forEach(function (id) {
				if (items[id]) {
					rootEl.removeChild(items[id]);
					rootEl.appendChild(items[id]);
				}
			});
		},


		/**
		 * For each element in the set, get the first element that matches the selector by testing the element itself and traversing up through its ancestors in the DOM tree.
		 * @param   {HTMLElement}  el
		 * @param   {String}       [selector]  default: `options.draggable`
		 * @returns {HTMLElement|null}
		 */
		closest: function (el, selector) {
			return _closest(el, selector || this.options.draggable, this.el);
		},


		/**
		 * Destroy
		 */
		destroy: function () {
			var el = this.el, options = this.options;

			_customEvents.forEach(function (name) {
				_off(el, name.substr(2).toLowerCase(), options[name]);
			});

			_off(el, 'mousedown', this._onTapStart);
			_off(el, 'touchstart', this._onTapStart);
			_off(el, 'selectstart', this._onTapStart);

			_off(el, 'dragover', this._onDragOver);
			_off(el, 'dragenter', this._onDragOver);

			//remove draggable attributes
			Array.prototype.forEach.call(el.querySelectorAll('[draggable]'), function (el) {
				el.removeAttribute('draggable');
			});

			touchDragOverListeners.splice(touchDragOverListeners.indexOf(this._onDragOver), 1);

			this._onDrop();

			this.el = null;
		}
	};


	function _bind(ctx, fn) {
		var args = slice.call(arguments, 2);
		return	fn.bind ? fn.bind.apply(fn, [ctx].concat(args)) : function () {
			return fn.apply(ctx, args.concat(slice.call(arguments)));
		};
	}


	function _closest(el, selector, ctx) {
		if (selector === '*') {
			return el;
		}
		else if (el) {
			ctx = ctx || document;
			selector = selector.split('.');

			var tag = selector.shift().toUpperCase(),
				re = new RegExp('\\s(' + selector.join('|') + ')\\s', 'g');

			do {
				if (
					(tag === '' || el.nodeName == tag) &&
					(!selector.length || ((' ' + el.className + ' ').match(re) || []).length == selector.length)
				) {
					return el;
				}
			}
			while (el !== ctx && (el = el.parentNode));
		}

		return null;
	}


	function _globalDragOver(evt) {
		evt.dataTransfer.dropEffect = 'move';
		evt.preventDefault();
	}


	function _on(el, event, fn) {
		el.addEventListener(event, fn, false);
	}


	function _off(el, event, fn) {
		el.removeEventListener(event, fn, false);
	}


	function _toggleClass(el, name, state) {
		if (el) {
			if (el.classList) {
				el.classList[state ? 'add' : 'remove'](name);
			}
			else {
				var className = (' ' + el.className + ' ').replace(/\s+/g, ' ').replace(' ' + name + ' ', '');
				el.className = className + (state ? ' ' + name : '');
			}
		}
	}


	function _css(el, prop, val) {
		var style = el && el.style;

		if (style) {
			if (val === void 0) {
				if (document.defaultView && document.defaultView.getComputedStyle) {
					val = document.defaultView.getComputedStyle(el, '');
				}
				else if (el.currentStyle) {
					val = el.currentStyle;
				}

				return prop === void 0 ? val : val[prop];
			}
			else {
				if (!(prop in style)) {
					prop = '-webkit-' + prop;
				}

				style[prop] = val + (typeof val === 'string' ? '' : 'px');
			}
		}
	}


	function _find(ctx, tagName, iterator) {
		if (ctx) {
			var list = ctx.getElementsByTagName(tagName), i = 0, n = list.length;

			if (iterator) {
				for (; i < n; i++) {
					iterator(list[i], i);
				}
			}

			return list;
		}

		return [];
	}


	function _disableDraggable(el) {
		el.draggable = false;
	}


	function _unsilent() {
		_silent = false;
	}


	/** @returns {HTMLElement|false} */
	function _ghostInBottom(el, evt) {
		var lastEl = el.lastElementChild, rect = lastEl.getBoundingClientRect();
		return (evt.clientY - (rect.top + rect.height) > 5) && lastEl; // min delta
	}


	/**
	 * Generate id
	 * @param   {HTMLElement} el
	 * @returns {String}
	 * @private
	 */
	function _generateId(el) {
		var str = el.tagName + el.className + el.src + el.href + el.textContent,
			i = str.length,
			sum = 0;

		while (i--) {
			sum += str.charCodeAt(i);
		}

		return sum.toString(36);
	}


	function _throttle(callback, ms) {
		var args, _this;

		return function () {
			if (args === void 0) {
				args = arguments;
				_this = this;

				setTimeout(function () {
					if (args.length === 1) {
						callback.call(_this, args[0]);
					} else {
						callback.apply(_this, args);
					}

					args = void 0;
				}, ms);
			}
		};
	}


	// Export utils
	Sortable.utils = {
		on: _on,
		off: _off,
		css: _css,
		find: _find,
		bind: _bind,
		throttle: _throttle,
		closest: _closest,
		toggleClass: _toggleClass,
		dispatchEvent: _dispatchEvent
	};


	Sortable.version = '0.6.0';


	/**
	 * Create sortable instance
	 * @param {HTMLElement}  el
	 * @param {Object}      [options]
	 */
	Sortable.create = function (el, options) {
		return new Sortable(el, options);
	};

	// Export
	return Sortable;
});
