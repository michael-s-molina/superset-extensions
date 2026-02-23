import json  # noqa: TID251
import logging

from flask import request, Response
from flask_appbuilder.api import expose, permission_name, protect, safe
from flask_login import current_user
from superset_core.api.daos import KeyValueDAO
from superset_core.api.rest_api import RestApi

logger = logging.getLogger(__name__)

RESOURCE_NAME = "editor_snippets"


class EditorSnippetsAPI(RestApi):
    resource_name = "editor_snippets"
    openapi_spec_tag = "Editor Snippets"
    class_permission_name = "editor_snippets"

    @expose("/", methods=("GET",))
    @protect()
    @safe
    @permission_name("read")
    def get_snippets(self) -> Response:
        user_id = current_user.id if current_user.is_authenticated else None
        if user_id is None:
            return self.response(401, message="User not authenticated")

        try:
            entry = KeyValueDAO.find_one_or_none(
                resource=RESOURCE_NAME, created_by_fk=user_id
            )

            if entry is None:
                return self.response(200, snippets=[])

            snippets = json.loads(entry.value)
            return self.response(200, snippets=snippets)
        except Exception as e:
            logger.exception("Failed to load snippets: %s", str(e))
            return self.response(500, message="Failed to load snippets")

    @expose("/", methods=("PUT",))
    @protect()
    @safe
    @permission_name("write")
    def save_snippets(self) -> Response:
        user_id = current_user.id if current_user.is_authenticated else None
        if user_id is None:
            return self.response(401, message="User not authenticated")

        try:
            snippets = request.json.get("snippets", [])
            value = json.dumps(snippets)

            entry = KeyValueDAO.find_one_or_none(
                resource=RESOURCE_NAME, created_by_fk=user_id
            )

            if entry is not None:
                KeyValueDAO.update(entry, attributes={"value": value})
            else:
                KeyValueDAO.create(
                    attributes={
                        "resource": RESOURCE_NAME,
                        "value": value,
                        "created_by_fk": user_id,
                    }
                )

            return self.response(200, message="Snippets saved")
        except Exception as e:
            logger.exception("Failed to save snippets: %s", str(e))
            return self.response(500, message="Failed to save snippets")
