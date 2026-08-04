import logging
from dataclasses import asdict

from flask import request, Response
from flask_appbuilder.api import expose, permission_name, protect, safe
from superset_core.rest_api.api import RestApi
from superset_core.rest_api.decorators import api

from .service import resume_turn, start_turn

logger = logging.getLogger(__name__)


@api(id="chat", name="Chat")
class ChatAPI(RestApi):
    @expose("/send", methods=("POST",))
    @protect()
    @safe
    @permission_name("read")
    def send(self) -> Response:
        history = request.json.get("history", [])
        client_tools = request.json.get("client_tools", [])

        logger.info("Chat request received - %d prior turns", len(history))

        try:
            turn = start_turn(history, client_tools)
            return self.response(200, result=asdict(turn))
        except Exception as e:
            logger.exception("Chat request failed: %s", str(e))
            return self.response(500, message=f"Chat request failed: {str(e)}")

    @expose("/resume", methods=("POST",))
    @protect()
    @safe
    @permission_name("read")
    def resume(self) -> Response:
        body = request.json
        client_tools = body.get("client_tools", [])

        logger.info(
            "Chat resume received - %d client tool result(s)",
            len(body.get("results", [])),
        )

        try:
            turn = resume_turn(
                body.get("state", []),
                body.get("resolved_results", []),
                body.get("results", []),
                client_tools,
            )
            return self.response(200, result=asdict(turn))
        except Exception as e:
            logger.exception("Chat resume failed: %s", str(e))
            return self.response(500, message=f"Chat resume failed: {str(e)}")
