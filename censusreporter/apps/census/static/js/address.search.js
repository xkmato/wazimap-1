L.mapbox.accessToken = 'pk.eyJ1IjoiY2Vuc3VzcmVwb3J0ZXIiLCJhIjoiQV9hS01rQSJ9.wtsn0FwmAdRV7cckopFKkA';
var GEOCODE_URL = _("http://api.tiles.mapbox.com/v4/geocode/mapbox.places/<%=query%>.json?access_token=<%=token%>").template()
var REVERSE_GEOCODE_URL = _("http://api.tiles.mapbox.com/v4/geocode/mapbox.places/<%=lng%>,<%=lat%>.json?access_token=<%=token%>").template()

var geoSearchAPI = 'http://api.censusreporter.org/1.0/geo/search';

var place_template = _.template($("#place-result-template").html())

var lat = '',
    lng = '',
    address = '',
    point_marker = null;

var marker_icon = L.icon({
    iconUrl: '/static/img/one_person_25x29.png',
    // shadowUrl: 'leaf-shadow.png',
    iconSize:     [25, 29], // size of the icon
    // shadowSize:   [50, 64], // size of the shadow
    iconAnchor:   [22, 29], // point of the icon which will correspond to marker's location
    // shadowAnchor: [4, 62],  // the same for the shadow
    popupAnchor:  [0, 0] // point from which the popup should open relative to the iconAnchor
});

// prepare spinner
$('body').append('<div id="body-spinner"></div>');
var spinnerTarget = document.getElementById('body-spinner');
    spinner = new Spinner();

// perhaps leave out the map on small viewports?
if (!(lat && lng)) {
    lat = '42.02';
    lng = '-87.67';
}
var map_center = new L.latLng(lat, lng);
window.map = L.mapbox.map('slippy-map', 'censusreporter.map-j9q076fv', {
    center: map_center,
    zoom: 13,
    scrollWheelZoom: true,
    zoomControl: false,
    doubleClickZoom: false,
    boxZoom: true,
    keyboard: true,
    dragging: true,
    touchZoom: true
});

map.addControl(new L.Control.Zoom({
    position: 'topright'
}));

var addressSearchEngine = new Bloodhound({
    datumTokenizer: Bloodhound.tokenizers.whitespace,
    queryTokenizer: Bloodhound.tokenizers.whitespace,
    limit: 10,
    remote: {
        url: GEOCODE_URL,
        replace: function (url, query) {
            return url({query: query, token: L.mapbox.accessToken});
        },
        filter: function(response) {
            var results = response.features;
            results = _.filter(results, function(item) { return item.geometry.type == "Point" && item.id.indexOf('address.') == 0; });
            results = _.map(results, function(item) { 
                item.place_name = item.place_name.replace(", United States", ""); 
                return item;
            });
            return results;
        }
    }
});
addressSearchEngine.initialize();

function selectAddress(obj, datum) {
    $("#address-search").val("");
    if (datum.geometry) {
        var label = datum.place_name;
        var lng = datum.geometry.coordinates[0];
        var lat = datum.geometry.coordinates[1];
        setMap(lat, lng);
        findPlaces(lat, lng, label);
        placeMarker(lat, lng, label);
    } else {
        return false;
    }
}

function makeAddressSearchWidget(element) {
    element.typeahead('destroy');
    element.typeahead({
        autoselect: true,
        highlight: false,
        hint: false,
        minLength: 3,
        updater: function(item) {
            console.log('updater');
            console.log(item);
        }
    }, {
        name: 'addresses',
        displayKey: 'place_name',
        source: addressSearchEngine.ttAdapter(),
        templates: {
            suggestion: Handlebars.compile(
                '<p class="result-name">{{place_name}}</p>'
            )
        }
    });

    element.on('typeahead:selected', selectAddress);
}

makeAddressSearchWidget($("#address-search"));

function basicLabel(lat,lng) {
    if (!lng) {
        lng = lat.lng;
        lat = lat.lat;
    }
    return lat.toFixed(2) + ", " + lng.toFixed(2);
}
map.on("dblclick",function(evt) { 
    var lat = evt.latlng.lat, lng = evt.latlng.lng;
    placeMarker(lat, lng)
    findPlaces(lat, lng);
})
if (navigator.geolocation) {
    $("#use-location").on("click",function() {
        $("#address-search-message").hide();
        spinner.spin(spinnerTarget);
        function foundLocation(position) {
            spinner.stop();
            lat = position.coords.latitude;
            lng = position.coords.longitude;
            setMap(lat,lng);
            placeMarker(lat,lng);
            findPlaces(lat, lng)
        }

        function noLocation() { 
            spinner.stop();
            $("#address-search-message").html('Sorry, your browser was unable to determine your location.'); 
            $("#address-search-message").show(); 
        }

        navigator.geolocation.getCurrentPosition(foundLocation, noLocation, {timeout:10000});

    })
} else {
    $("#use-location").hide();    
}

function labelWithReverse(point_marker) { 
    var ll = point_marker.getLatLng();
    var url = REVERSE_GEOCODE_URL({lat: ll.lat, lng: ll.lng, token: L.mapbox.accessToken});
    $.getJSON(url,function(data, status) {
        if (status == 'success' && data.features) {
            point_marker.getLabel().setContent(data.features[0].place_name);
            // seems like we also always want to update the address-search-message here, 
            // but we may also want to do that when we don't have a map. Tidy this later
            $("#address-search-message").html(data.features[0].place_name + " is in:");
            $("#address-search-message").show();
        }
    });
}

function geocodeAddress(query, callback) {
    var url = GEOCODE_URL({query: query, token: L.mapbox.accessToken});
    $.getJSON(url, callback);
}

function findPlaces(lat,lng,address) {
    spinner.spin(spinnerTarget);
    $(".location-list").hide();

    if (address) {
        $("#address-search-message").html(address + " is in:");
        $("#address-search-message").show();
    } else {
        $("#address-search-message").html("Your location: " + basicLabel(lat,lng));
        $("#address-search-message").show();
    }

    params = { 'lat': lat, 'lon': lng, 'sumlevs': '010,020,030,040,050,060,140,160,250,310,400,500,610,620,860,950,960,970' }
    $.getJSON(geoSearchAPI,params, function(data, status) {
        spinner.stop();
        if (status == 'success') {
            $("#data-display").html("");
            var list = $("<ul class='location-list'></ul>");
            list.appendTo($("#data-display"));

            var results = _.sortBy(data.results,function(x){ return sumlevMap[x.sumlevel].size_sort });
            for (var i = 0; i < results.length; i++) {
                var d = results[i];
                d['SUMLEVELS'] = sumlevMap;
                $(place_template(d)).appendTo(list);
                window.stash = results;
            }
            $('body').trigger('glossaryUpdate', list);
        } else {
            $("#data-display").html(status);
        }
    })
}

function placeMarker(lat, lng, label) {
    if (point_marker) {
        point_marker.setLatLng(L.latLng(lat,lng));
    } else {
        point_marker = new L.Marker(L.latLng(lat,lng),{icon: marker_icon, fillColor: "#66c2a5", fillOpacity: 1, stroke: false, radius: 5, draggable: true});
        point_marker.on("drag",function(evt) {
            point_marker.hideLabel();
        })
        point_marker.on("dragend", function(evt) {
            window.stash = evt;
            var new_pos = evt.target.getLatLng();
            point_marker.getLabel().setContent(basicLabel(new_pos));
            point_marker.showLabel();
            labelWithReverse(point_marker);
            findPlaces(new_pos.lat, new_pos.lng);

        })
        map.addLayer(point_marker);
    }

    var reverse = (!label);

    if (reverse) {
        label = basicLabel(lat,lng)
    }
    if (point_marker.getLabel()) {
        point_marker.getLabel().setContent(label);
    } else {
        point_marker.bindLabel(label, {noHide: true});
    }
    point_marker.showLabel();
    if (reverse) {
        labelWithReverse(point_marker);
    }


}
function setMap(lat, lng) {
    if (map) {
        var map_center = new L.latLng(lat, lng);
        map.panTo(map_center);
    }
}

$(".location-list li").on("mouseover",function(){
    var geoid = $(this).data('geoid');
    console.log(geoid);
})
