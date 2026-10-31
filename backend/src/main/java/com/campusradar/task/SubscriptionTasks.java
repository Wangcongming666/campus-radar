package com.campusradar.task;

import com.campusradar.common.OwnerTransactions;
import com.campusradar.notification.NotificationService;
import org.springframework.stereotype.Component;
import java.util.Map;

@Component
public class SubscriptionTasks implements TaskHandler {
    private final NotificationService notifications;private final OwnerTransactions tx;
    public SubscriptionTasks(NotificationService notifications,OwnerTransactions tx){this.notifications=notifications;this.tx=tx;}
    public boolean supports(String type){return "SUBSCRIPTION_SCAN".equals(type);}
    public String execute(String type,String user,Map<String,Object>payload){runScan(user,payload.get("subscriptionId").toString());return null;}
    public Object runScan(String user,String id){return tx.write(user,"POST","/worker/subscriptions/"+id,null,Map.of(),200,false,()->notifications.scan(user,id));}
}
