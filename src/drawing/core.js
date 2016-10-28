(function(f, define){
    define([ "./geometry", "../kendo.popup" ], f);
})(function(){

(function ($) {

    // Imports ================================================================
    var noop = $.noop,
        toString = Object.prototype.toString,

        kendo = window.kendo,
        outerWidth = kendo._outerWidth,
        outerHeight = kendo._outerHeight,
        Class = kendo.Class,
        Widget = kendo.ui.Widget,
        deepExtend = kendo.deepExtend,

        util = kendo.util,
        defined = util.defined,
        limitValue = util.limitValue,

        g = kendo.geometry,

        proxy = $.proxy,

        NS = ".kendo",
        TOOLTIP_TEMPLATE = '<div class="k-tooltip">' +
            '<div class="k-tooltip-content"></div>' +
        '</div>',
        TOOLTIP_CLOSE_TEMPLATE = '<div class="k-tooltip-button"><a href="\\#" class="k-icon k-i-close">close</a></div>';

    // Base drawing surface ==================================================
    var Surface = Widget.extend({
        init: function(element, options) {
            this.options = deepExtend({}, this.options, options);

            Widget.fn.init.call(this, element, this.options);

            this._click = this._handler("click");
            this._mouseenter = this._handler("mouseenter");
            this._mouseleave = this._handler("mouseleave");
            this._mousemove = this._handler("mousemove");

            this._visual = new kendo.drawing.Group();

            if (this.options.width) {
                this.element.css("width", this.options.width);
            }

            if (this.options.height) {
                this.element.css("height", this.options.height);
            }

            this._enableTracking();
        },

        options: {
            name: "Surface",
            tooltip: {}
        },

        events: [
            "click",
            "mouseenter",
            "mouseleave",
            "mousemove",
            "resize",
            "tooltipOpen",
            "tooltipClose"
        ],

        draw: function(element) {
            this._visual.children.push(element);
        },

        clear: function() {
            this._visual.children = [];
            this.hideTooltip();
        },

        destroy: function() {
            this._visual = null;

            if (this._tooltip) {
                this._tooltip.destroy();
                delete this._tooltip;
            }

            Widget.fn.destroy.call(this);
        },

        exportVisual: function() {
            return this._visual;
        },

        getSize: function() {
            return {
                width: this.element.width(),
                height: this.element.height()
            };
        },

        setSize: function(size) {
            this.element.css({
                width: size.width,
                height: size.height
            });

            this._size = size;
            this._resize();
        },

        eventTarget: function(e) {
            var domNode = $(e.touch ? e.touch.initialTouch : e.target);
            var node;

            while (!node && domNode.length > 0) {
                node = domNode[0]._kendoNode;
                if (domNode.is(this.element) || domNode.length === 0) {
                    break;
                }

                domNode = domNode.parent();
            }

            if (node) {
                return node.srcElement;
            }
        },

        showTooltip: function(shape, options) {
            if (this._tooltip) {
                this._tooltip.show(shape, options);
            }
        },

        hideTooltip: function() {
            if (this._tooltip) {
                this._tooltip.hide();
            }
        },

        suspendTracking: function() {
            this._suspendedTracking = true;
            this.hideTooltip();
        },

        resumeTracking: function() {
            this._suspendedTracking = false;
        },

        _resize: noop,

        _handler: function(event) {
            var surface = this;

            return function(e) {
                var node = surface.eventTarget(e);
                if (node && !surface._suspendedTracking) {
                    surface.trigger(event, {
                        element: node,
                        originalEvent: e,
                        type: event
                    });
                }
            };
        },

        _enableTracking: function() {
            if (kendo.ui.Popup) {
                this._tooltip = new SurfaceTooltip(this, this.options.tooltip || {});
            }
        },

        _elementOffset: function() {
            var element = this.element;
            var offset = element.offset();
            var paddingLeft = parseInt(element.css("paddingLeft"), 10);
            var paddingTop = parseInt(element.css("paddingTop"), 10);

            return {
                left: offset.left + paddingLeft,
                top: offset.top + paddingTop
            };
        },

        _surfacePoint: function (event) {
            var offset = this._elementOffset();
            var coord = eventCoordinates(event);
            var x = coord.x - offset.left;
            var y = coord.y - offset.top;

            return new g.Point(x, y);
        }
    });

    kendo.ui.plugin(Surface);

    Surface.create = function(element, options) {
        return SurfaceFactory.current.create(element, options);
    };

    // Base surface node =====================================================
    var BaseNode = Class.extend({
        init: function(srcElement) {
            this.childNodes = [];
            this.parent = null;

            if (srcElement) {
                this.srcElement = srcElement;
                this.observe();
            }
        },

        destroy: function() {
            if (this.srcElement) {
                this.srcElement.removeObserver(this);
            }

            var children = this.childNodes;
            for (var i = 0; i < children.length; i++) {
                this.childNodes[i].destroy();
            }

            this.parent = null;
        },

        load: noop,

        observe: function() {
            if (this.srcElement) {
                this.srcElement.addObserver(this);
            }
        },

        append: function(node) {
            this.childNodes.push(node);
            node.parent = this;
        },

        insertAt: function(node, pos) {
            this.childNodes.splice(pos, 0, node);
            node.parent = this;
        },

        remove: function(index, count) {
            var end = index + count;
            for (var i = index; i < end; i++) {
                this.childNodes[i].removeSelf();
            }
            this.childNodes.splice(index, count);
        },

        removeSelf: function() {
            this.clear();
            this.destroy();
        },

        clear: function() {
            this.remove(0, this.childNodes.length);
        },

        invalidate: function() {
            if (this.parent) {
                this.parent.invalidate();
            }
        },

        geometryChange: function() {
            this.invalidate();
        },

        optionsChange: function() {
            this.invalidate();
        },

        childrenChange: function(e) {
            if (e.action === "add") {
                this.load(e.items, e.index);
            } else if (e.action === "remove") {
                this.remove(e.index, e.items.length);
            }

            this.invalidate();
        }
    });

    // Options storage with optional observer =============================
    var OptionsStore = Class.extend({
        init: function(options, prefix) {
            var field,
                member;

            this.prefix = prefix || "";

            for (field in options) {
                member = options[field];
                member = this._wrap(member, field);
                this[field] = member;
            }
        },

        get: function(field) {
            return kendo.getter(field, true)(this);
        },

        set: function(field, value) {
            var current = kendo.getter(field, true)(this);

            if (current !== value) {
                var composite = this._set(field, this._wrap(value, field));
                if (!composite) {
                    this.optionsChange({
                        field: this.prefix + field,
                        value: value
                    });
                }
            }
        },

        _set: function(field, value) {
            var composite = field.indexOf(".") >= 0;

            if (composite) {
                var parts = field.split("."),
                    path = "",
                    obj;

                while (parts.length > 1) {
                    path += parts.shift();
                    obj = kendo.getter(path, true)(this);

                    if (!obj) {
                        obj = new OptionsStore({}, path + ".");
                        obj.addObserver(this);
                        this[path] = obj;
                    }

                    if (obj instanceof OptionsStore) {
                        obj.set(parts.join("."), value);
                        return composite;
                    }

                    path += ".";
                }
            }

            this._clear(field);
            kendo.setter(field)(this, value);

            return composite;
        },

        _clear: function(field) {
            var current = kendo.getter(field, true)(this);
            if (current && current.removeObserver) {
                current.removeObserver(this);
            }
        },

        _wrap: function(object, field) {
            var type = toString.call(object);

            if (object !== null && defined(object) && type === "[object Object]") {
                if (!(object instanceof OptionsStore) && !(object instanceof Class)) {
                    object = new OptionsStore(object, this.prefix + field + ".");
                }

                object.addObserver(this);
            }

            return object;
        }
    });
    deepExtend(OptionsStore.fn, kendo.mixins.ObserversMixin);

    var SurfaceFactory = function() {
        this._items = [];
    };

    SurfaceFactory.prototype = {
        register: function(name, type, order) {
            var items = this._items,
                first = items[0],
                entry = {
                    name: name,
                    type: type,
                    order: order
                };

            if (!first || order < first.order) {
                items.unshift(entry);
            } else {
                items.push(entry);
            }
        },

        create: function(element, options) {
            var items = this._items,
                match = items[0];

            if (options && options.type) {
                var preferred = options.type.toLowerCase();
                for (var i = 0; i < items.length; i++) {
                    if (items[i].name === preferred) {
                        match = items[i];
                        break;
                    }
                }
            }

            if (match) {
                return new match.type(element, options);
            }

            kendo.logToConsole(
                "Warning: Unable to create Kendo UI Drawing Surface. Possible causes:\n" +
                "- The browser does not support SVG, VML and Canvas. User agent: " + navigator.userAgent + "\n" +
                "- The Kendo UI scripts are not fully loaded");
        }
    };

    SurfaceFactory.current = new SurfaceFactory();

    //TO DO: delay?, callout?, ajax content?
    var SurfaceTooltip = Class.extend({
        init: function(surface, options) {
            this.element = $(TOOLTIP_TEMPLATE);
            this.content = this.element.children(".k-tooltip-content");

            options = options || {};

            this.options = deepExtend({}, this.options, this._tooltipOptions(options));

            this.popup = new kendo.ui.Popup(this.element, {
                appendTo: options.appendTo,
                animation: options.animation,
                copyAnchorStyles: false,
                collision: "fit fit"
            });

            this._openPopupHandler = $.proxy(this._openPopup, this);

            this.surface = surface;
            this._bindEvents();
        },

        options: {
            position: "top",
            showOn: "mouseenter",
            offset: 7,
            autoHide: true,
            hideDelay: 0,
            showAfter: 100
        },

        _bindEvents: function() {
            this._showHandler = proxy(this._showEvent, this);
            this._surfaceLeaveHandler = proxy(this._surfaceLeave, this);
            this._mouseleaveHandler = proxy(this._mouseleave, this);
            this._mousemoveHandler = proxy(this._mousemove, this);

            this.surface.bind("click", this._showHandler);
            this.surface.bind("mouseenter", this._showHandler);
            this.surface.bind("mouseleave", this._mouseleaveHandler);
            this.surface.bind("mousemove", this._mousemoveHandler);

            this.surface.element.on("mouseleave" + NS, this._surfaceLeaveHandler);

            this.element.on("click" + NS, ".k-tooltip-button", proxy(this._hideClick, this));
        },

        destroy: function() {
            var popup = this.popup;

            this.surface.unbind("click", this._showHandler);
            this.surface.unbind("mouseenter", this._showHandler);
            this.surface.unbind("mouseleave", this._mouseleaveHandler);
            this.surface.unbind("mousemove", this._mousemoveHandler);

            this.surface.element.off("mouseleave" + NS, this._surfaceLeaveHandler);
            this.element.off("click" + NS);

            if (popup) {
                popup.destroy();
                delete this.popup;
            }

            clearTimeout(this._timeout);

            delete this.popup;
            delete this.element;
            delete this.content;
            delete this.surface;
        },

        _tooltipOptions: function(options) {
            options = options || {};
            return {
                position: options.position,
                showOn: options.showOn,
                offset: options.offset,
                autoHide: options.autoHide,
                width: options.width,
                height: options.height,
                content: options.content,
                shared: options.shared,
                hideDelay: options.hideDelay,
                showAfter: options.showAfter
            };
        },

        _tooltipShape: function(shape) {
            while(shape && !shape.options.tooltip) {
                shape = shape.parent;
            }
            return shape;
        },

        _updateContent: function(target, shape, options) {
            var content = options.content;
            if (kendo.isFunction(content)) {
                content = content({
                    element: shape,
                    target: target
                });
            }

            if (content) {
                this.content.html(content);
                return true;
            }
        },

        _position: function(shape, options, elementSize, event) {
            var position = options.position;
            var tooltipOffset = options.offset || 0;
            var surface = this.surface;
            var offset = surface._elementOffset();
            var size = surface.getSize();
            var surfaceOffset = surface._offset;
            var bbox = shape.bbox();
            var width = elementSize.width;
            var height = elementSize.height;
            var left = 0, top = 0;

            bbox.origin.translate(offset.left, offset.top);
            if (surfaceOffset) {
                bbox.origin.translate(-surfaceOffset.x, -surfaceOffset.y);
            }

            if (position == "cursor" && event) {
                var coord = eventCoordinates(event);
                left = coord.x - width / 2;
                top = coord.y - height - tooltipOffset;
            } else if (position == "left") {
                left = bbox.origin.x - width - tooltipOffset;
                top = bbox.center().y - height / 2;
            } else if (position == "right") {
                left = bbox.bottomRight().x + tooltipOffset;
                top = bbox.center().y - height / 2;
            } else if (position == "bottom") {
                left = bbox.center().x - width / 2;
                top = bbox.bottomRight().y + tooltipOffset;
            } else {
                left = bbox.center().x - width / 2;
                top = bbox.origin.y - height - tooltipOffset;
            }

            return {
                left: limitValue(left, offset.left, offset.left + size.width),
                top: limitValue(top, offset.top, offset.top + size.height)
            };
        },

        show: function(shape, options) {
            this._show(shape, shape, deepExtend({}, this.options, this._tooltipOptions(shape.options.tooltip), options));
        },

        hide: function() {
            var current = this._current;
            delete this._current;
            clearTimeout(this._showTimeout);
            if (this.popup.visible() && current &&
                !this.surface.trigger("tooltipClose", { element: current.shape, target: current.target, popup: this.popup})) {
                this.popup.close();
            }
        },

        _hideClick: function(e) {
            e.preventDefault();
            this.hide();
        },

        _show: function(target, shape, options, event, delay) {
            var current = this._current;

            clearTimeout(this._timeout);

            if (current && ((current.shape === shape && options.shared) || current.target === target)) {
                return;
            }

            clearTimeout(this._showTimeout);

            if (!this.surface.trigger("tooltipOpen", { element: shape, target: target, popup: this.popup }) &&
                this._updateContent(target, shape, options)) {

                this._autoHide(options);
                var elementSize = this._measure(options);

                var popup = this.popup;
                if (popup.visible()) {
                    popup.close(true);
                }

                this._current = {
                    options: options,
                    elementSize: elementSize,
                    shape: shape,
                    target: target,
                    position: this._position(options.shared ? shape: target, options, elementSize, event)
                };

                if (delay) {
                    this._showTimeout = setTimeout(this._openPopupHandler, options.showAfter || 0);
                } else {
                    this._openPopup();
                }
            }
        },

        _openPopup: function() {
            var current = this._current;
            var position = current.position;

            this.popup.open(position.left, position.top);
        },

        _autoHide: function(options) {
            if (options.autoHide && this._closeButton) {
                this.element.removeClass("k-tooltip-closable");
                this._closeButton.remove();
                delete this._closeButton;
            }

            if (!options.autoHide && !this._closeButton) {
                this.element.addClass("k-tooltip-closable");
                this._closeButton = $(TOOLTIP_CLOSE_TEMPLATE).prependTo(this.element);
            }
        },

        _showEvent: function(e) {
            var shape = this._tooltipShape(e.element);
            if (shape) {
                var options = deepExtend({}, this.options, this._tooltipOptions(shape.options.tooltip));

                if (options && options.showOn == e.type) {
                    this._show(e.element, shape, options, e.originalEvent, true);
                }
            }
        },

        _measure: function(options) {
            var width, height;
            this.element.css({
                width: "auto",
                height: "auto"
            });
            var visible = this.popup.visible();
            if (!visible) {
                this.popup.wrapper.show();
            }

            this.element.css({
                width: defined(options.width) ? options.width : "auto",
                height: defined(options.height) ? options.height : "auto"
            });

            width = outerWidth(this.element);
            height = outerHeight(this.element);

            if (!visible) {
                this.popup.wrapper.hide();
            }

            return {
                width: width,
                height: height
            };
        },

        _mouseleave: function(e) {
            if (!this._popupRelatedTarget(e.originalEvent)) {
                var tooltip = this;
                var current = tooltip._current;

                if (current && current.options.autoHide) {
                    tooltip._timeout = setTimeout(function() {
                        clearTimeout(tooltip._showTimeout);
                        tooltip.hide();
                    }, current.options.hideDelay || 0);
                }
            }
        },

        _mousemove: function(e) {
            var current = this._current;
            if (current && e.element) {
                var options = current.options;
                if (options.position == "cursor") {
                    var position = this._position(e.element, options, current.elementSize, e.originalEvent);
                    current.position = position;
                    this.popup.wrapper.css({left: position.left, top: position.top});
                }
            }
        },

        _surfaceLeave: function(e) {
            if (!this._popupRelatedTarget(e)) {
                clearTimeout(this._showTimeout);
                this.hide();
            }
        },

        _popupRelatedTarget: function(e) {
            return e.relatedTarget && $(e.relatedTarget).closest(this.popup.wrapper).length;
        }
    });

    function eventCoordinates(event) {
        var x, y;
        if (event.touch) {
            x = event.x.location;
            y = event.y.location;
        } else {
            x = event.pageX || event.clientX || 0;
            y = event.pageY || event.clientY || 0;
        }

        return {
            x: x,
            y: y
        };
    }

    // Exports ================================================================
    deepExtend(kendo, {
        drawing: {
            DASH_ARRAYS: {
                dot: [1.5, 3.5],
                dash: [4, 3.5],
                longdash: [8, 3.5],
                dashdot: [3.5, 3.5, 1.5, 3.5],
                longdashdot: [8, 3.5, 1.5, 3.5],
                longdashdotdot: [8, 3.5, 1.5, 3.5, 1.5, 3.5]
            },

            Color: kendo.Color,
            BaseNode: BaseNode,
            OptionsStore: OptionsStore,
            Surface: Surface,
            SurfaceFactory: SurfaceFactory,
            SurfaceTooltip: SurfaceTooltip
        }
    });

    kendo.dataviz.drawing = kendo.drawing;

})(window.kendo.jQuery);

}, typeof define == 'function' && define.amd ? define : function(a1, a2, a3){ (a3 || a2)(); });