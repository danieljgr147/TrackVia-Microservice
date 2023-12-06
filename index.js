import TrackviaAPI from "trackvia-api"; // if installed through npm
import constants from "./constants.js";
import helper from "./sortCoords.js";

const {
    apiKey,
    accessToken,
    baseUrl,
    accountId,
    farmPlotsDefaultViewId,
    farmPlotCoordinatesDefaultViewID,
    triggeringFieldId,
    coordinateToFarmPlotRelxFieldId,
} = constants;

export const handler = async function (event) {
    let api;

    try {
        api = new TrackviaAPI(apiKey, accessToken, baseUrl, accountId);
    } catch (err) {
        console.log("ERROR CREATING TRACKVIA API");
        return {
            statusCode: 404,
            message: "ERROR CREATING TRACKVIA API: " + err.message,
        };
    }

    let farmPlot;

    try {
        farmPlot = await api.getRecord(farmPlotsDefaultViewId, event.recordId);
    } catch (err) {
        console.log("COULD NOT FETCH FARM RECORD");
        return {
            statusCode: 404,
            message: "COULD NOT FETCH FARM RECORD: " + err.message,
        };
    }

    let forestResponse;
    let plotCenter;

    if (!farmPlot.data?.[triggeringFieldId].includes("Yes")) {
        console.log("COULD NOT access if");
        return {
            statusCode: 200,
            message: "Success",
        };
    }

    try {
        let coordinates = await api.getView(
            farmPlotCoordinatesDefaultViewID,
            null,
            farmPlot.data["Record ID"]
        );

        const areaCoords = coordinates.data
            .filter(
                (coordinate) =>
                    coordinate[`${coordinateToFarmPlotRelxFieldId}(id)`] ===
                    farmPlot.data.id
            )
            .map(({ Location }) => ({
                lat: Number(Location.latitude),
                lng: Number(Location.longitude),
            }));

        const sortedArray = helper.sortCoords(areaCoords);
        plotCenter = helper.getCenter(sortedArray);

        sortedArray.push(sortedArray[0]);

        const cords = sortedArray.map((item) => [
            Number(item.lng),
            Number(item.lat),
        ]);

        const body = {
            geometry: {
                type: "Polygon",
                coordinates: [cords],
            },
            sql: "SELECT SUM(area__ha) FROM results WHERE umd_tree_cover_loss__year >=2014 and umd_tree_cover_loss__year <= 2021 group by umd_tree_cover_loss__year",
        };

        const resp = await fetch(
            "https://data-api.globalforestwatch.org/dataset/umd_tree_cover_loss/latest/query",
            {
                method: "POST",
                body: JSON.stringify(body),
                headers: { "Content-Type": "application/json" },
            }
        );

        forestResponse = await resp.json();
    } catch (err) {
        console.log("COULD NOT GET FARM PLOT COORDINATES VIEW");
        return {
            statusCode: 404,
            message: "COULD NOT GET FARM PLOT COORDINATES VIEW: " + err.message,
        };
    }

    let textoPersonalizado;

    if (forestResponse.data.lenght) {
        textoPersonalizado = "El lote no presenta deforestacion";
    } else {
        textoPersonalizado = "El plot presenta deforestacion en los años: \n";

        forestResponse.data.forEach(
            (el) =>
                (textoPersonalizado += `En el año ${el.umd_tree_cover_loss__year} hubo ${el.area__ha} hectareas deforestadas. \n`)
        );
    }

    try {
        await api.updateRecord(farmPlotsDefaultViewId, farmPlot.data.id, {
            ["EUDR Commets"]: textoPersonalizado,
            ["Plot Center"]: JSON.stringify(plotCenter),
        });
    } catch (err) {
        console.log("COULD NOT RESET CALCULATE AREA FIELD" + err.message);
        return {
            statusCode: 502,
            message: 'COULD NOT RESET "CALCULATE AREA" FIELD: ' + err.message,
        };
    }

    return {
        statusCode: 200,
        message: "Success",
    };
};

//handler({ recordId: 6519 })