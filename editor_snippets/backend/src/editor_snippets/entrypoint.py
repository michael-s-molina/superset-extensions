from superset_core.api import rest_api

from .api import EditorSnippetsAPI

rest_api.add_extension_api(EditorSnippetsAPI)
