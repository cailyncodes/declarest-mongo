module.exports = (function(req, resp, next) {
  req.payload.newField = "You are able to add fields to the request payload";
  console.log("You can also log information");
  // you could also do authentication, or pretty much anything else
  next(req, resp);

  // alternatively, I could call 
});
