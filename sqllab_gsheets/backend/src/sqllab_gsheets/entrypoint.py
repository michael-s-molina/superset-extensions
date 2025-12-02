from superset_core.api import rest_api

from .api import GSheetsExportAPI

rest_api.add_extension_api(GSheetsExportAPI)
