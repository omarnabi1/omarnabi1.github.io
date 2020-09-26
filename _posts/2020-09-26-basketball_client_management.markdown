---
layout: post
title:      "Basketball Client Management "
date:       2020-09-26 13:37:07 -0400
permalink:  basketball_client_management
---


For my Rails Portfolio Project, I built Basketball Client Management. It is a client management app built for basketball trainers. Basketball is something I love, enjoy and understand so the reason I decided to build my app centered around basketball is because I was hoping that love, enjoyment and understanding would spill over to Rails, also - and it pretty much did. Basketball is something that is simple on the surface but once you truly understand the game, you realize its so much deeper than that. And for me, Ruby on Rails felt the same way. Initially, I found it simple[er] to follow but once I started working on this app and started to struggle, I realized the learning had just began and how deep Rails is - like Basketball.


#### Where to begin

The most difficult part of this project was that it required both creativity and technicality -- both challenging in their own ways. My creative juices got going first. I began to think about the user flow and through that I started to incorporate the **Model-View-Controller** pattern to get the technacality juices going also.  


### MVC

Model-View-Controller is an architechtural structure for an app that is focused **seperation-of-concerns.** The sructure seperates an app into **three logical components**: The Model, The View and The Controller and each of these components is designed to handle a specific aspect of the app. 

Let's talk in basketball terms -- 

Think about the *San Antonio Spurs* with *Tim Duncan, Tony Parker, Manu Ginobli* or the *Los Angeles Lakers* with *Kobe Bryant, Shaquille O'neal, Robert Horry*, the *Golden State Warriors* with *Stepehn Curry, Klay Thompson and Draymond Green/Kevin Durant* or even the *Miami Heat* with *Lebron James, Dwyane Wade, Chris Bosh*. What do these basketball teams and players have to do with MVC and Ruby? Those players are each able to handle specific aspects of a basketball game and they do it very efficiently. If a basketball team had to depend on one player to focus on every aspect of the game, it would not be a very good basketball team, just ask *James Harden* and the *Houston Rockets*

Similarily, If an app is built and the logic of the app is not evenly seperated, it would not be a well-functioning app. 

**Seperation-of-Concerns** = Championships and Well-Functioning Apps. 



#### Models 


First, what are models in Ruby? To explain it in basketball terms, the model is like your 3 and D guy. The player knows their responsibility on offense is to shoot 3's and on defense to be a lock down defender. The player doesn't stray from what they specialize in. Similarly, the model specializes in data and setting attributes. 

Here is a metaphor that helped me understand what a model is. It works for me - hopefully, for you as well. 

A model is like an Excel formula. 
* You define the formula (You tell the model what it is)
* You fill in the cells with data (You give the models the attributes it needs to make itself)
* You drag it down the column (Your model is a factory of the thing you made it)


In my case I decided on 4 models:
1. `user.rb`
2. `client.rb`
3. `appointment.rb`
4. `location.rb`





#### `user.rb`

This is the trainer. I could have called it `trainer.rb` - it would have made more sense but `user.rb` seemed more conventional and Ruby likes conventions. In order to make this model it needs to be "fed" the following data(attributes) 
*       `t.string :username`
*       `t.string :emai`
*       `t.string :password_digest`


All that basically means is that when the trainer signs up for my app, they will need to fill in a form with a username, a VALID email address and a password. The reason I exagerated a valid email is because your models can validate the attributes you feed them --> you set the validations and this is how you can ensure bad data doesn't get to your database (this is done with the help of controllers and views, more about that later)


#### `client.rb`

This is the client. As soon as you include a new mode, you have to start thinking about how the models are associated to each other. This may sound simple but trust me -- It's a maze. We'll keep it simple for now. The client belongs to a user. 

*       `belongs_to :user`

Attributes of the client model

*       ` t.string :name`
*       `t.string :phone_number`
*       `t.string :email`


***Timeout!!***


Before I move on to the other models, a quick look at **Nested Forms.**  

Ruby on Rails is magical and powerful, kind of like *Disney*. One example of this is a nested form which allows you to create multiple models at once by saving the attributes of the child model to the parent model. In this app, when a user fills up the form for a new appointment, they also fill out the attributes for a new client and location. The child-parent relationship is determined on your associations. 



#### `appointment.rb`

Associations for the appointment model

*     `belongs_to :location`
*     `belongs_to :user`
*     `belongs_to :client`
* 

Attributes for the appointment model:

*       `t.datetime :time`
*       `t.date :date`
*       `t.float :price`


#### `location.rb`

I was hesitant about making a location model but after some thought I decied it was a good idea. The reason for my hesitation was because of the maze I mentioned earlier - *mo' models, mo' associations, mo' complications*


Eventually, I concluded the location is as significant as the client model when creating an appointment. 


 Associations for the location model.

* belongs_to :user
* has_many :appointments, dependent: :destroy
* has_many :clients, through: :appointments

Attribute for the location model.

*       `t.string :nickname`
*       `t.string :city`
*       `t.string :street_address`
*       `t.string :state`
*       `t.string :zipcode`
      
So I had my models, I defined them (told them what they were) and defined the associations (told them how they were related to each other). Now I had to start thinking about the end user would see this information. 

Let's rewind to the associations we have so far. 
1. A user (the trainer)d has many clients, has many appointments and has many locations
2. A client belongs to a user, has many appointments and has many locations through the appointment
3. A location belongs to a user, has many appointments and has many clients through the appointment
4. An appointment belongs to a user, belongs to a client and belongs to a location

*.........a maze, didn't I tell you.*


### Views

What are Views in Ruby? 

Views simply display data to your end-users in an easy and understandable format and what the user sees is dependant on their interaction with the app. 

Let's go back to basketball. The view is your franchise player, they represent the team to the fans because this player is who the fans see the most. This analogy is a weaker than my first but views are simpe[er] to understand. Views are what the end user sees, the interface of the app. 

The user can, through a view, add, edit, delete, update data (CRUD). The view is the users POV to doing CRUD functionality

In Ruby, the convention is each resource will have their own model, views and controller so for my app, these are my views. 

![pic](./Users/omarnabi/desktop/views.png)


### Controllers

And last, but certainly not least - Controllers. What are controllers in Ruby?

The controller, like its name is what controls the logic of the app. Through the controllers you add logic via actions. For example, in my appointment controller, my new action tells the appointment the logic to making a new appointment. And I have similar logic in my client, location and user controller. In controllers you include your logic for CRUD and anything else you want your models to do.

So what does that mean? 

The controller is the player that is the engine for the team. This player could be someone like Draymond Green, he controls the game when hes on the court. He makes sure everyone is following game plan, does the dirty work, communicates constantly on the court and most importantly, **takes in commands from the coach and delivers the commands to the players. **




### Conclusion 

So, there you have it. That is my app and that is how I would explain the concept of MVS through the language of basketball. The Model is your Klay Thompson, Chris Bosh, Robert Horry - they know their roles, they are really good at it and they stick to it. The View is your franchise player, Kobe Bryant, LeBron James, Tim Duncan, Kevin Durant - these guys are what the fans see and their play is partly determined by their counterparts. They depend on the Model and the Controller to feed it the right data to ensure the user gets what they want, similarily, the franchise players depend on their team to ensure a winning outcome for the fans. And finally, the Controller, this is your Stephen Curry, Dwyane Wade, Tony Parker, Draymond Green. These guys controll the pace of the game, the communication from the coach to the players and make sure everything is functioning like a well-oiled machine. As a whole, seperation-of-concerns can lead to well functioning apps and championships. 









