const express = require('express');

const pool = require('../utilities/exports').pool;

const router = express.Router();

const pushy = require('../utilities/exports').messaging

const validation = require('../utilities').validation;
let isStringProvided = validation.isStringProvided;

/**
 * @apiDefine JSONError
 * @apiError (400: JSON Error) {String} message "malformed JSON in parameters"
 */ 
/**
 * @api {post} /chats Request to create a chat
 * @apiName PostChats
 * @apiGroup Chats
 * 
 * @apiHeader {String} authorization Valid JSON Web Token JWT
 * 
 * @apiSuccess (Success 201) {boolean} success true when the name is inserted
 * @apiSuccess (Success 201) {Number} chatID the generated chatId
 * 
 * @apiError (400: Unknown user) {String} message "unknown email address"
 * 
 * @apiError (400: Missing Parameters) {String} message "Missing required information"
 * 
 * @apiError (400: SQL Error) {String} message the reported SQL error details
 *
 * @apiUse JSONError
 */ 
router.post("/", (request, response, next) => {
    if (!isStringProvided(request.body.name)) {
        response.status(400).send({
            message: "Missing required information"
        })
    } else {
        next()
    }
}, (request, response) => {

    let insert = `INSERT INTO Chats(Name)
                  VALUES ($1)
                  RETURNING ChatId`
    let values = [request.body.name]
    pool.query(insert, values)
        .then(result => {
            response.status(201).send({
                success: true,
                chatID:result.rows[0].chatid
            })
        }).catch(err => {
            response.status(400).send({
                message: "SQL Error",
                error: err
            })

        })
});


/**
 * @api {get} /chats Request basic info about all chats for a user.
 * @apiName GetAllChats
 * @apiGroup Chats
 * 
 * @apiDescription Produces a list of chatrooms and basic info about each 
 * for the user associated with the JWT.
 * 
 * @apiHeader {String} authorization Valid JSON Web Token JWT
 * 
 * @apiSuccess {Number} rowCount the number of chat rooms returned
 * @apiSuccess {Object[]} chatRooms list of chat rooms returned 
 * @apiSuccess {String} chatRooms.id id of the chat room
 * @apiSuccess {String} chatRooms.name name of the chat room
 * 
 * @apiError (400: SQL Error) {String} message the reported SQL error details
 * 
 * @apiUse JSONError
 */ 
router.get("/", (request, response) => {
    //Retrieve the chat rooms
    let query = `SELECT Chats.ChatID as "id", Chats.Name AS "name"
                FROM Chats
                JOIN ChatMembers
                ON ChatMembers.ChatID = Chats.ChatID
                WHERE ChatMembers.MemberID = $1`
    let values = [request.decoded.memberid]
    pool.query(query, values)
        .then(result => {
            response.send({
                rowCount : result.rowCount,
                chatRooms: result.rows
            })
        }).catch(err => {
            response.status(400).send({
                message: "SQL Error",
                error: err
            })
        })
});

/**
 * @api {delete} /chats Request to delete a chat
 * @apiName DeleteChat
 * @apiGroup Chats
 * 
 * @apiDescription Deletes the entire chat room, this may be a useless endpoint, do not use yet.
 * 
 * @apiHeader {String} authorization Valid JSON Web Token JWT
 * 
 * @apiParam {Number} name ID of the chat
 * 
 * @apiSuccess (Success 200) {boolean} success true when the chat room is deleted
 * 
 * 
 * @apiError (400: Missing Parameters) {String} message "Missing required information"
 * 
 * @apiError (400: Malformed Parameter) {String} message "Malformed parameter. chatId must be a number"
 * 
 * @apiError (400: Chat Not Empty) {String} message chat room still contains members
 * 
 * @apiError (400: SQL Error) {String} message the reported SQL error details
 * 
 * @apiError (400: Unknown Chat ID) {String} message "Chat ID not found"
 * 
 * @apiUse JSONError
 */ 
router.delete("/:chatId?", (request, response, next) => {
    console.log("Received chat ID:", request.params.chatId);
    // validate non-missing or invalid (type) parameters
    if (!request.params.chatId) {
        response.status(400).send({
            message: "Missing required information"
        });
    } else if (isNaN(request.params.chatId)) {
        response.status(400).send({
            message: "Malformed parameter. chatId must be a number"
        });
    } else {
        next();
    }
}, (request, response, next) => {
    // validate chat id exists
    const query = 'SELECT * FROM CHATS WHERE ChatId=$1';
    const values = [request.params.chatId];

    pool.query(query, values)
        .then(result => {
            if (result.rowCount == 0) {
                response.status(404).send({
                    message: "Chat ID not found"
                });
            } else {
                console.log("Chat ID exists");
                next();
            }
        }).catch(error => {
            console.log("Error validating chat ID:", error);
            response.status(400).send({
                message: "SQL Error",
                error: error
            });
        });
}, (request, response, next) => {
    // delete chat room entry for the user from ChatMembers table
    const deleteChatMemberQuery = `DELETE FROM ChatMembers WHERE ChatId=$1 AND MemberId=$2`;
    const deleteChatMemberValues = [request.params.chatId, request.decoded.memberid];
    pool.query(deleteChatMemberQuery, deleteChatMemberValues)
        .then(deleteChatMemberResult => {
            console.log("Deleted chat member for chat ID:", request.params.chatId);
            next();
        })
        .catch(err => {
            console.log("Error deleting chat member:", err);
            response.status(400).send({
                message: "SQL Error",
                error: err
            });
        });
}, (request, response, next) => {
    // check if there are any remaining members in the chat
    const checkRemainingMembersQuery = `SELECT COUNT(*) AS memberCount FROM ChatMembers WHERE ChatId=$1`;
    const checkRemainingMembersValues = [request.params.chatId];
    pool.query(checkRemainingMembersQuery, checkRemainingMembersValues)
        .then(checkRemainingMembersResult => {
            const memberCount = parseInt(checkRemainingMembersResult.rows[0].membercount);
            if (memberCount > 0) {
                console.log("Chat has remaining members. Chat ID:", request.params.chatId);
                response.status(200).send({
                    success: true
                });
            } else {
                next();
            }
        })
        .catch(err => {
            console.log("Error checking remaining members:", err);
            response.status(400).send({
                message: "SQL Error",
                error: err
            });
        });
}, (request, response) => {
    // delete chat room from Chats table if no remaining members
    const deleteChatQuery = `DELETE FROM Chats WHERE ChatID=$1`;
    const deleteChatValues = [request.params.chatId];
    pool.query(deleteChatQuery, deleteChatValues)
        .then(deleteChatResult => {
            console.log("Deleted chat ID:", request.params.chatId);
            response.status(200).send({
                success: true
            });
        })
        .catch(err => {
            console.log("Error deleting chat room:", err);
            response.status(400).send({
                message: "SQL Error",
                error: err
            });
        });
});

/**
 * @api {put} /chats/:chatId? Request add a user to a chat
 * @apiName PutChats
 * @apiGroup Chats
 * 
 * @apiDescription Adds the user associated with the required JWT. 
 * 
 * @apiHeader {String} authorization Valid JSON Web Token JWT
 * 
 * @apiParam {Number} chatId the chat to add the user to
 * 
 * @apiSuccess {boolean} success true when the name is inserted
 * 
 * @apiError (404: Chat Not Found) {String} message "chatID not found"
 * @apiError (404: Email Not Found) {String} message "email not found"
 * @apiError (400: Invalid Parameter) {String} message "Malformed parameter. chatId must be a number" 
 * @apiError (400: Duplicate Email) {String} message "user already joined"
 * @apiError (400: Missing Parameters) {String} message "Missing required information"
 * 
 * @apiError (400: SQL Error) {String} message the reported SQL error details
 * 
 * @apiUse JSONError
 */ 
router.put("/:chatId/", (request, response, next) => {
    //validate non-missing or invalid (type) parameters
    if (!request.params.chatId) {
        response.status(400).send({
            message: "Missing required information"
        })
    } else if (isNaN(request.params.chatId)) {
        response.status(400).send({
            message: "Malformed parameter. chatId must be a number"
        })
    } else {
        next()
    }
}, (request, response, next) => {
    //validate chat id exists
    let query = 'SELECT * FROM CHATS WHERE ChatId=$1'
    let values = [request.params.chatId]

    pool.query(query, values)
        .then(result => {
            if (result.rowCount == 0) {
                response.status(404).send({
                    message: "Chat ID not found"
                })
            } else {
                next()
            }
        }).catch(error => {
            response.status(400).send({
                message: "SQL Error",
                error: error
            })
        })
        //code here based on the results of the query
}, (request, response, next) => {
    //validate email exists 
    let query = 'SELECT * FROM Members WHERE MemberId=$1'
    let values = [request.decoded.memberid]

    pool.query(query, values)
        .then(result => {
            if (result.rowCount == 0) {
                response.status(404).send({
                    message: "email not found"
                })
            } else {
                //user found
                next()
            }
        }).catch(error => {
            response.status(400).send({
                message: "SQL Error",
                error: error
            })
        })
}, (request, response, next) => {
    //validate email does not already exist in the chat
    let query = 'SELECT * FROM ChatMembers WHERE ChatId=$1 AND MemberId=$2'
    let values = [request.params.chatId, request.decoded.memberid]

    pool.query(query, values)
        .then(result => {
            if (result.rowCount > 0) {
                response.status(400).send({
                    message: "user already joined"
                })
            } else {
                next()
            }
        }).catch(error => {
            response.status(400).send({
                message: "SQL Error",
                error: error
            })
        })

}, (request, response) => {
    //Insert the memberId into the chat
    let insert = `INSERT INTO ChatMembers(ChatId, MemberId)
                  VALUES ($1, $2)
                  RETURNING *`
    let values = [request.params.chatId, request.decoded.memberid]
    pool.query(insert, values)
        .then(result => {
            response.send({
                success: true
            })
        }).catch(err => {
            response.status(400).send({
                message: "SQL Error",
                error: err
            })
        })
});

/**
 * @api {put} /chats/:chatId?/:email? Request add a user to a chat by email
 * @apiName PutChatsEmail
 * @apiGroup Chats
 * 
 * @apiDescription Adds the user associated with the supplied email.
 * 
 * @apiHeader {String} authorization Valid JSON Web Token JWT
 * 
 * @apiParam {Number} chatId the chat to add the user to
 * 
 * @apiParam {String} email the email of the user to add
 * 
 * @apiSuccess {boolean} success true when the user is inserted
 * 
 * @apiError (404: Chat Not Found) {String} message "chatID not found"
 * @apiError (404: User Not Found) {String} message "user not found"
 * @apiError (400: Invalid Parameter) {String} message "Malformed parameter. chatId must be a number" 
 * @apiError (400: Missing Parameters) {String} message "Missing required information"
 * 
 * @apiError (400: SQL Error) {String} message the reported SQL error details
 * 
 * @apiUse JSONError
 */ 
router.put("/:chatId/:email", (request, response, next) => {
    //validate non-empty parameters
    if (!request.params.chatId || !request.params.email) {
        response.status(400).send({
            message: "Missing required information"
        })
    } else if (isNaN(request.params.chatId)) {
        response.status(400).send({
            message: "Malformed parameter. chatId must be a number"
        })
    } else {
        next()
    }
}, (request, response, next) => {
    //validate chat id exists
    const query = 'SELECT * FROM CHATS WHERE ChatId=$1'
    const values = [request.params.chatId]

    pool.query(query, values)
        .then(result => {
            if (result.rowCount == 0) {
                response.status(404).send({
                    message: "Chat ID not found"
                })
            } else {
                request.name = result.rows[0].name;
                next()
            }
        }).catch(error => {
            response.status(400).send({
                message: "SQL Error",
                error: error
            })
        })
}, (request, response, next) => {
    //validate user exists 
    let query = 'SELECT * FROM Members WHERE Email=$1'
    let values = [request.params.email]

    pool.query(query, values)
        .then(result => {
            if (result.rowCount == 0) {
                response.status(404).send({
                    message: "User not found"
                })
            } else {
                //user found
                request.memberid = result.rows[0].memberid;
                next()
            }
        }).catch(error => {
            response.status(400).send({
                message: "SQL Error",
                error: error
            })
        })
}, (request, response, next) => {
    //validate email does not already exist in the chat
    let query = 'SELECT * FROM ChatMembers WHERE ChatId=$1 AND MemberId=$2'
    let values = [request.params.chatId, request.memberid]

    pool.query(query, values)
        .then(result => {
            if (result.rowCount > 0) {
                response.status(400).send({
                    message: "user already joined"
                })
            } else {
                next()
            }
        }).catch(error => {
            response.status(400).send({
                message: "SQL Error",
                error: error
            })
        })

}, (request, response, next) => {
    //Insert the memberId into the chat
    let insert = `INSERT INTO ChatMembers(ChatId, MemberId)
                  VALUES ($1, $2)`
    let values = [request.params.chatId, request.memberid]
    pool.query(insert, values)
        .then(result => {
            next()
        }).catch(err => {
            response.status(400).send({
                message: "SQL Error",
                error: err
            })
        })
}, (request, response) => {
    // send a notification of this action to the added member
    let query = `SELECT token FROM Push_Token WHERE Push_token.memberid=$1`
    let values = [request.memberid]
    pool.query(query, values)
        .then(result => {
            result.rows.forEach(entry => {
                console.log(entry.token);
                pushy.sendChatAction(
                    entry.token, 
                    "newRoom",
                    request.params.chatId,
                    request.name,
                    )
            })
            response.send({
                success: true
            })
        }).catch(err => {

            response.status(400).send({
                message: "SQL Error on select from push token",
                error: err
            })
        })
});

/**
 * @api {get} /chats/:chatId? Request to get the info of users in a chat
 * @apiName GetChats
 * @apiGroup Chats
 * 
 * @apiDescription Returns a list of emails of all users in the specified chat room
 * 
 * @apiHeader {String} authorization Valid JSON Web Token JWT
 * 
 * @apiParam {Number} chatId the chat to look up. 
 * 
 * @apiSuccess {Number} rowCount the number of messages returned
 * @apiSuccess {Object[]} members List of members in the chat
 * @apiSuccess {String} messages.email The email of the member in the chat
 * @apiSuccess {String} messages.username The username of the member in the chat
 * 
 * @apiError (404: ChatId Not Found) {String} message "Chat ID Not Found"
 * @apiError (400: Invalid Parameter) {String} message "Malformed parameter. chatId must be a number" 
 * @apiError (400: Missing Parameters) {String} message "Missing required information"
 * 
 * @apiError (400: SQL Error) {String} message the reported SQL error details
 * 
 * @apiUse JSONError
 */ 
router.get("/:chatId", (request, response, next) => {
    //validate non-missing or invalid (type) parameters
    if (!request.params.chatId) {
        response.status(400).send({
            message: "Missing required information"
        })
    } else if (isNaN(request.params.chatId)) {
        response.status(400).send({
            message: "Malformed parameter. chatId must be a number"
        })
    } else {
        next()
    }
},  (request, response, next) => {
    //validate chat id exists
    let query = 'SELECT * FROM CHATS WHERE ChatId=$1'
    let values = [request.params.chatId]

    pool.query(query, values)
        .then(result => {
            if (result.rowCount == 0) {
                response.status(404).send({
                    message: "Chat ID not found"
                })
            } else {
                next()
            }
        }).catch(error => {
            response.status(400).send({
                message: "SQL Error",
                error: error
            })
        })
}, (request, response) => {
    //Retrieve the members
    let query = `SELECT Members.Email, Members.Username
                FROM ChatMembers
                INNER JOIN Members ON ChatMembers.MemberId=Members.MemberId
                WHERE ChatId=$1`
    let values = [request.params.chatId]
    pool.query(query, values)
        .then(result => {
            response.send({
                rowCount : result.rowCount,
                rows: result.rows
            })
        }).catch(err => {
            response.status(400).send({
                message: "SQL Error",
                error: err
            })
        })
});

/**
 * @api {delete} /chats/:chatId?/:email? Request delete a user from a chat
 * @apiName DeleteChats
 * @apiGroup Chats
 * 
 * @apiDescription Does not delete the user associated with the required JWT but 
 * instead deletes the user based on the email parameter.  
 * 
 * @apiParam {Number} chatId the chat to delete the user from
 * @apiParam {String} email the email of the user to delete
 * 
 * @apiSuccess {boolean} success true when the name is deleted
 * 
 * @apiError (404: Chat Not Found) {String} message "chatID not found"
 * @apiError (404: Email Not Found) {String} message "email not found"
 * @apiError (400: Invalid Parameter) {String} message "Malformed parameter. chatId must be a number" 
 * @apiError (400: Duplicate Email) {String} message "user not in chat"
 * @apiError (400: Missing Parameters) {String} message "Missing required information"
 * 
 * @apiError (400: SQL Error) {String} message the reported SQL error details
 * 
 * @apiUse JSONError
 */ 
router.delete("/:chatId/:email", (request, response, next) => {
    //validate non-missing or invalid (type) parameters
    if (!request.params.chatId || !request.params.email) {
        response.status(400).send({
            message: "Missing required information"
        })
    } else if (isNaN(request.params.chatId)) {
        response.status(400).send({
            message: "Malformed parameter. chatId must be a number"
        })
    } else {
        next()
    }
}, (request, response, next) => {
    //validate chat id exists
    let query = 'SELECT * FROM CHATS WHERE ChatId=$1'
    let values = [request.params.chatId]

    pool.query(query, values)
        .then(result => {
            if (result.rowCount == 0) {
                response.status(404).send({
                    message: "Chat ID not found"
                })
            } else {
                next()
            }
        }).catch(error => {
            response.status(400).send({
                message: "SQL Error",
                error: error
            })
        })
}, (request, response, next) => {
    //validate email exists AND convert it to the associated memberId
    let query = 'SELECT MemberID FROM Members WHERE Email=$1'
    let values = [request.params.email]

    pool.query(query, values)
        .then(result => {
            if (result.rowCount == 0) {
                response.status(404).send({
                    message: "email not found"
                })
            } else {
                request.params.email = result.rows[0].memberid
                next()
            }
        }).catch(error => {
            response.status(400).send({
                message: "SQL Error",
                error: error
            })
        })
}, (request, response, next) => {
    //validate email exists in the chat
    let query = 'SELECT * FROM ChatMembers WHERE ChatId=$1 AND MemberId=$2'
    let values = [request.params.chatId, request.params.email]

    pool.query(query, values)
        .then(result => {
            if (result.rowCount > 0) {
                next()
            } else {
                response.status(400).send({
                    message: "user not in chat"
                })
            }
        }).catch(error => {
            response.status(400).send({
                message: "SQL Error",
                error: error
            })
        })

}, (request, response) => {
    //Delete the memberId from the chat
    let insert = `DELETE FROM ChatMembers
                  WHERE ChatId=$1
                  AND MemberId=$2
                  RETURNING *`
    let values = [request.params.chatId, request.params.email]
    pool.query(insert, values)
        .then(result => {
            response.send({
                success: true
            })
        }).catch(err => {
            response.status(400).send({
                message: "SQL Error",
                error: err
            })
        })
});

module.exports = router;